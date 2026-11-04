import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import Material from '../src/models/Material.js'
import Caja from '../src/models/Caja.js'
import Contador from '../src/models/Contador.js'
import { siguienteCodigoMaterial } from '../src/services/codigosMaterial.js'
import { siguienteCodigoCaja } from '../src/services/codigosCaja.js'

process.env.DOTENV_CONFIG_PATH = '/dev/null'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-codigos-materiales-cajas-'))
  const servidor = createServer()
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar)
    servidor.listen(0, '127.0.0.1', resolver)
  })
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_codigos',
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
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_codigos',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    cliente = null
    await mongoose.connect(
      `mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_codigos`,
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

test('códigos legibles y asignación de registros previos sin tocar otra base', async (t) => {
  const temporal = await mongoTemporal()
  t.after(async () => {
    await mongoose.disconnect()
    if (temporal.proceso.exitCode === null) {
      temporal.proceso.kill('SIGTERM')
      await new Promise((resolver) => temporal.proceso.once('exit', resolver))
    }
    await rm(temporal.carpeta, { recursive: true, force: true })
  })
  const { asignarCodigosExistentes } = await import('../scripts/asignarCodigosMaterialesCajas.js')
  const datosMaterial = { titulo: 'Guía ficticia', descripcion: 'Prueba',
    tipo: 'Guía', enlace: 'https://example.test/guia' }
  const materialAntiguo = await Material.create({ ...datosMaterial,
    fechaRegistro: new Date('2026-01-01T00:00:00Z') })
  const materialReciente = await Material.create({ ...datosMaterial, titulo: 'Otra guía',
    fechaRegistro: new Date('2026-01-02T00:00:00Z') })
  const usuario = new mongoose.Types.ObjectId()
  const cajaAntigua = await Caja.create({ usuarioResponsable: usuario,
    fechaOperativa: '2026-01-01', abiertaEn: new Date('2026-01-01T12:00:00Z'),
    montoInicialCentavos: 0, estado: 'CERRADA' })
  const cajaReciente = await Caja.create({ usuarioResponsable: usuario,
    fechaOperativa: '2026-01-02', abiertaEn: new Date('2026-01-02T12:00:00Z'),
    montoInicialCentavos: 0, estado: 'ABIERTA' })

  await assert.rejects(asignarCodigosExistentes('sigca_prod', { aplicar: true }),
    /base conectada no coincide/)
  const simulacion = await asignarCodigosExistentes('sigca_test')
  assert.deepEqual(simulacion.map((item) => item.pendientesIniciales), [2, 2])
  assert.equal(await Contador.countDocuments(), 0)
  const aplicacion = await asignarCodigosExistentes('sigca_test', { aplicar: true })
  assert.deepEqual(aplicacion.map((item) => item.asignados), [2, 2])
  assert.deepEqual(aplicacion.map((item) => item.faltantes), [0, 0])
  assert.equal((await Material.findById(materialAntiguo.id)).codigo, 'MAT-0001')
  assert.equal((await Material.findById(materialReciente.id)).codigo, 'MAT-0002')
  assert.equal((await Caja.findById(cajaAntigua.id)).codigo, 'CAJ-0001')
  assert.equal((await Caja.findById(cajaReciente.id)).codigo, 'CAJ-0002')
  assert.deepEqual((await asignarCodigosExistentes('sigca_test', { aplicar: true }))
    .map((item) => item.asignados), [0, 0])

  const codigoNuevoMaterial = await siguienteCodigoMaterial()
  const codigoNuevaCaja = await siguienteCodigoCaja()
  assert.equal(codigoNuevoMaterial, 'MAT-0003')
  assert.equal(codigoNuevaCaja, 'CAJ-0003')
  await assert.rejects(Material.create({ ...datosMaterial, codigo: 'MAT-0001' }),
    (error) => error.code === 11000)
  await assert.rejects(Caja.create({ usuarioResponsable: new mongoose.Types.ObjectId(),
    fechaOperativa: '2026-01-03', montoInicialCentavos: 0, codigo: 'CAJ-0001' }),
  (error) => error.code === 11000)
})
