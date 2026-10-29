import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { asignarCodigosExistentes } from '../scripts/asignarCodigosResponsables.js'
import { crearToken } from '../src/middleware/autenticacion.js'
import Contador from '../src/models/Contador.js'
import ImagenCargada from '../src/models/ImagenCargada.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Usuario from '../src/models/Usuario.js'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function puertoDisponible() {
  const servidor = createServer()
  await new Promise((resolver) => servidor.listen(0, '127.0.0.1', resolver))
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  return puerto
}

async function iniciarMongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-responsables-'))
  const puerto = await puertoDisponible()
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_prueba',
    '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  let cliente
  try {
    for (let intento = 0; intento < 50; intento += 1) {
      try {
        cliente = await new mongoose.mongo.MongoClient(
          `mongodb://127.0.0.1:${puerto}/?directConnection=true`,
          { serverSelectionTimeoutMS: 300 }).connect()
        break
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició mongod local')
        await pausa(100)
      }
    }
    if (!cliente) throw new Error('MongoDB local no respondió')
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_prueba',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_prueba`,
      { serverSelectionTimeoutMS: 10000 })
    return { carpeta, proceso }
  } catch (error) {
    await cliente?.close().catch(() => {})
    proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

const datosResponsable = { fotografia: '/imagenes/existente.png', nombres: 'Ana',
  apellidos: 'Prueba', parentesco: 'Hermano/a', telefono: '55551234',
  correo: 'ana@example.test', direccion: 'Dirección de prueba' }

test('códigos correlativos de responsables, migración, búsqueda y relaciones',
  { skip: process.env.SIGCA_PROBAR_MONGO_LOCAL !== '1' }, async (t) => {
    const temporal = await iniciarMongoTemporal()
    t.after(async () => {
      await mongoose.disconnect()
      if (temporal.proceso.exitCode === null) {
        temporal.proceso.kill('SIGTERM')
        await new Promise((resolver) => temporal.proceso.once('exit', resolver))
      }
      await rm(temporal.carpeta, { recursive: true, force: true })
    })
    process.env.JWT_SECRET = randomBytes(32).toString('hex')
    process.env.CORS_ORIGIN = 'http://localhost:5173'
    const { default: app } = await import('../src/app.js')
    const servidor = app.listen(0, '127.0.0.1')
    await new Promise((resolver) => servidor.once('listening', resolver))
    t.after(() => new Promise((resolver) => servidor.close(resolver)))
    const base = `http://127.0.0.1:${servidor.address().port}`
    const admin = await Usuario.create({ nombre: 'Administrador de prueba',
      correo: 'admin@example.test', passwordHash: await bcrypt.hash('SoloPrueba123', 4),
      rol: 'ADMINISTRADOR' })
    const token = crearToken(admin)
    const pedir = async (ruta, metodo = 'GET', datos) => {
      const respuesta = await fetch(`${base}${ruta}`, { method: metodo,
        headers: { Authorization: `Bearer ${token}`,
          ...(datos ? { 'Content-Type': 'application/json' } : {}) },
        body: datos ? JSON.stringify(datos) : undefined })
      return { status: respuesta.status, body: await respuesta.json() }
    }

    await Responsable.init()
    const antiguoId = new mongoose.Types.ObjectId()
    await Responsable.collection.insertOne({ _id: antiguoId, ...datosResponsable,
      createdAt: new Date('2024-01-01T00:00:00Z') })
    const paciente = await Paciente.create({ codigo: 'PAC-000001',
      fotografia: '/imagenes/existente.png', nombres: 'Paciente', apellidos: 'Prueba',
      fechaNacimiento: '2000-01-01', sexo: 'FEMENINO', telefono: '55551234',
      direccion: 'Prueba', fechaInicioProceso: '2026-01-01',
      responsables: [antiguoId] })
    const fotoId = randomUUID()
    const fotografia = `/api/imagenes/privadas/${fotoId}`
    await ImagenCargada.create({ _id: fotoId, categoria: 'responsable',
      publicId: `sigca/test/responsable/${fotoId}`, valor: fotografia, privada: true })
    assert.equal((await pedir('/api/responsables', 'POST',
      { ...datosResponsable, fotografia })).status, 503)
    await assert.rejects(asignarCodigosExistentes('sigca_prod'), /no coincide/)
    const migracion = await asignarCodigosExistentes('sigca_test')
    assert.equal(migracion.asignados, 1)
    assert.equal(migracion.faltantes, 0)
    assert.equal((await Responsable.findById(antiguoId)).codigo, 'RESPO-000001')
    assert.equal((await asignarCodigosExistentes('sigca_test')).asignados, 0)

    const cuerpo = { ...datosResponsable, fotografia }
    const nuevos = await Promise.all(Array.from({ length: 4 }, () =>
      pedir('/api/responsables', 'POST', cuerpo)))
    assert.ok(nuevos.every((item) => item.status === 201))
    assert.deepEqual(nuevos.map((item) => item.body.responsable.codigo).sort(),
      ['RESPO-000002', 'RESPO-000003', 'RESPO-000004', 'RESPO-000005'])
    assert.equal((await Contador.findById('responsables')).secuencia, 5)
    await assert.rejects(Responsable.collection.insertOne({ ...datosResponsable,
      codigo: 'RESPO-000001' }), { code: 11000 })
    const busqueda = await pedir('/api/responsables?buscar=RESPO-000001')
    assert.equal(busqueda.body.responsables[0].id, String(antiguoId))
    assert.equal((await pedir(`/api/responsables/${antiguoId}`)).body.responsable.codigo,
      'RESPO-000001')
    assert.equal((await pedir('/api/responsables', 'POST',
      { ...cuerpo, codigo: 'RESPO-999999' })).status, 400)
    assert.equal((await pedir(`/api/responsables/${antiguoId}`, 'PUT',
      { ...cuerpo, codigo: 'RESPO-999999' })).status, 400)
    const edicion = await pedir(`/api/responsables/${antiguoId}`, 'PUT', cuerpo)
    assert.equal(edicion.body.responsable.codigo, 'RESPO-000001')
    const detallePaciente = await pedir(`/api/pacientes/${paciente.id}`)
    assert.equal(detallePaciente.body.paciente.responsables[0].codigo, 'RESPO-000001')
    assert.equal(String((await Paciente.findById(paciente.id)).responsables[0]),
      String(antiguoId))
  })
