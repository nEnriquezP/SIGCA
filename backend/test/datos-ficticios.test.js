import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import Usuario from '../src/models/Usuario.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Servicio from '../src/models/Servicio.js'
import Cita from '../src/models/Cita.js'
import SolicitudCita from '../src/models/SolicitudCita.js'
import Material from '../src/models/Material.js'
import AsignacionMaterial from '../src/models/AsignacionMaterial.js'
import Pago from '../src/models/Pago.js'
import Caja from '../src/models/Caja.js'
import ContenidoInstitucional from '../src/models/ContenidoInstitucional.js'
import Horario from '../src/models/Horario.js'
import { totalesCaja } from '../src/services/finanzas.js'

process.env.DOTENV_CONFIG_PATH = '/dev/null'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-datos-demo-'))
  const servidor = createServer()
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar)
    servidor.listen(0, '127.0.0.1', resolver)
  })
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_datos_demo',
    '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  let cliente
  try {
    for (let intento = 0; intento < 60; intento += 1) {
      try {
        cliente = await new mongoose.mongo.MongoClient(
          `mongodb://127.0.0.1:${puerto}/?directConnection=true`,
          { serverSelectionTimeoutMS: 300 }).connect()
        break
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició MongoDB temporal')
        await pausa(100)
      }
    }
    if (!cliente) throw new Error('MongoDB temporal no respondió')
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_datos_demo',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    cliente = null
    await mongoose.connect(
      `mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_datos_demo`,
      { serverSelectionTimeoutMS: 10000 })
    assert.equal(mongoose.connection.name, 'sigca_test')
    return { carpeta, proceso }
  } catch (error) {
    await cliente?.close().catch(() => {})
    if (proceso.exitCode === null) proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

test('la carga ficticia cumple mínimos, conserva relaciones y nunca acepta producción', async (t) => {
  const temporal = await mongoTemporal()
  t.after(async () => {
    await mongoose.disconnect()
    if (temporal.proceso.exitCode === null) {
      temporal.proceso.kill('SIGTERM')
      await new Promise((resolver) => temporal.proceso.once('exit', resolver))
    }
    await rm(temporal.carpeta, { recursive: true, force: true })
  })
  const { cargarDatosFicticios } = await import('../scripts/cargarDatosFicticios.js')
  await assert.rejects(cargarDatosFicticios('sigca_prod', { aplicar: true }),
    /solo admite/)
  const simulacion = await cargarDatosFicticios('sigca_test')
  assert.equal(simulacion.estado, 'simulación')
  assert.equal(await Usuario.countDocuments(), 0)
  const password = `Aa1_${randomBytes(8).toString('hex')}`
  const resultado = await cargarDatosFicticios('sigca_test', { aplicar: true, password })
  assert.equal(resultado.estado, 'cargado')
  assert.deepEqual(resultado.creados, { usuarios: 6, responsables: 5,
    pacientes: 10, servicios: 5, citas: 15, materiales: 5,
    asignaciones: 5, solicitudes: 5, pagos: 10, cajas: 3 })
  const conteos = await Promise.all([Usuario, Responsable, Paciente, Servicio, Cita,
    Material, AsignacionMaterial, SolicitudCita, Pago, Caja,
    ContenidoInstitucional, Horario].map((Modelo) => Modelo.countDocuments()))
  assert.deepEqual(conteos, [6, 5, 10, 5, 15, 5, 5, 5, 10, 3, 1, 7])
  assert.equal(await Pago.countDocuments({ estado: 'ANULADO' }), 1)
  assert.equal(await Caja.countDocuments({ estado: 'CERRADA' }), 2)
  assert.equal(await Caja.countDocuments({ estado: 'ABIERTA' }), 1)
  assert.equal(await Paciente.countDocuments({ responsables: { $ne: [] } }), 5)
  assert.equal(await Material.countDocuments({ codigo: /^MAT-/ }), 5)
  assert.equal(await Caja.countDocuments({ codigo: /^CAJ-/ }), 3)
  assert.equal(await SolicitudCita.countDocuments({ codigo: /^CONS-CITA-/ }), 5)
  const cajasCerradas = await Caja.find({ estado: 'CERRADA' })
  for (const caja of cajasCerradas) {
    const totales = await totalesCaja(caja.id)
    assert.equal(caja.totalEfectivoCentavos, totales.EFECTIVO)
    assert.equal(caja.totalTransferenciaCentavos, totales.TRANSFERENCIA)
    assert.equal(caja.totalTarjetaCentavos, totales.TARJETA)
    assert.equal(caja.totalIngresosCentavos,
      totales.EFECTIVO + totales.TRANSFERENCIA + totales.TARJETA)
  }
  assert.equal((await cargarDatosFicticios('sigca_test', { aplicar: true, password })).estado,
    'ya cargado')
  assert.equal(await Pago.countDocuments(), 10)
})
