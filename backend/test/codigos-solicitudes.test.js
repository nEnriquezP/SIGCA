import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import SolicitudCita from '../src/models/SolicitudCita.js'
import { asignarCodigosSolicitudes } from '../scripts/asignarCodigosSolicitudes.js'
import { codigoSolicitud, crearSolicitudConCodigo } from '../src/services/codigosSolicitud.js'

process.env.DOTENV_CONFIG_PATH = '/dev/null'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-codigos-solicitudes-'))
  const servidor = createServer()
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar)
    servidor.listen(0, '127.0.0.1', resolver)
  })
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  try {
    for (let intento = 0; intento < 60; intento += 1) {
      try {
        await mongoose.connect(`mongodb://127.0.0.1:${puerto}/sigca_test`,
          { serverSelectionTimeoutMS: 300 })
        return { carpeta, proceso }
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició MongoDB temporal')
        await pausa(100)
      }
    }
    throw new Error('MongoDB temporal no respondió')
  } catch (error) {
    if (proceso.exitCode === null) proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

test('códigos de solicitudes conservan los anteriores y amplían sufijos repetidos', async (t) => {
  const temporal = await mongoTemporal()
  t.after(async () => {
    await mongoose.disconnect()
    if (temporal.proceso.exitCode === null) {
      temporal.proceso.kill('SIGTERM')
      await new Promise((resolver) => temporal.proceso.once('exit', resolver))
    }
    await rm(temporal.carpeta, { recursive: true, force: true })
  })
  const idA = new mongoose.Types.ObjectId(`${'0'.repeat(19)}abcde`)
  const idB = new mongoose.Types.ObjectId(`${'1'.repeat(19)}abcde`)
  const idC = new mongoose.Types.ObjectId(`${'2'.repeat(19)}12345`)
  const idD = new mongoose.Types.ObjectId(`${'3'.repeat(19)}abcde`)
  const datos = { nombreSolicitante: 'Persona ficticia', correo: 'solicitud@example.test',
    telefono: '79223344', servicio: new mongoose.Types.ObjectId(),
    fechaPreferida: '2026-12-01', mensajeAdicional: '' }
  await SolicitudCita.create({ ...datos, _id: idA })
  await SolicitudCita.create({ ...datos, _id: idB })
  await SolicitudCita.create({ ...datos, _id: idC, codigo: codigoSolicitud(idC) })

  await assert.rejects(asignarCodigosSolicitudes('sigca_prod', { aplicar: true }),
    /base conectada no coincide/)
  assert.deepEqual(await asignarCodigosSolicitudes('sigca_test'),
    { pendientes: 2, asignados: 0, faltantes: 2 })
  assert.equal((await SolicitudCita.findById(idA)).codigo, undefined)
  assert.deepEqual(await asignarCodigosSolicitudes('sigca_test', { aplicar: true }),
    { pendientes: 2, asignados: 2, faltantes: 0 })
  assert.equal((await SolicitudCita.findById(idA)).codigo, 'CONS-CITA-ABCDE')
  assert.equal((await SolicitudCita.findById(idB)).codigo, 'CONS-CITA-1ABCDE')
  assert.equal((await SolicitudCita.findById(idC)).codigo, 'CONS-CITA-12345')
  assert.deepEqual(await asignarCodigosSolicitudes('sigca_test', { aplicar: true }),
    { pendientes: 0, asignados: 0, faltantes: 0 })

  const nueva = await crearSolicitudConCodigo(datos, idD)
  assert.equal(nueva.codigo, 'CONS-CITA-3ABCDE')
  await assert.rejects(SolicitudCita.create({ ...datos, codigo: 'CONS-CITA-ABCDE' }),
    (error) => error.code === 11000)
})
