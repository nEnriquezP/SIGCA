import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Cita from '../src/models/Cita.js'
import Contador from '../src/models/Contador.js'
import ImagenCargada from '../src/models/ImagenCargada.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Usuario from '../src/models/Usuario.js'
import { asignarCodigosExistentes } from '../scripts/asignarCodigosPacientes.js'
import { crearToken } from '../src/middleware/autenticacion.js'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const ejecutarArchivo = promisify(execFile)

async function puertoDisponible() {
  const servidor = createServer()
  await new Promise((resolver, rechazar) => servidor.listen(0, '127.0.0.1',
    (error) => error ? rechazar(error) : resolver()))
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  return puerto
}

async function iniciarMongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-codigos-'))
  const puerto = await puertoDisponible()
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_prueba',
    '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  const uriDirecta = `mongodb://127.0.0.1:${puerto}/?directConnection=true`
  let cliente
  try {
    for (let intento = 0; intento < 50; intento += 1) {
      try {
        cliente = await new mongoose.mongo.MongoClient(uriDirecta,
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
    cliente = null
    const uri = `mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_prueba`
    await mongoose.connect(uri,
      { serverSelectionTimeoutMS: 10000 })
    return { proceso, carpeta, uri }
  } catch (error) {
    await cliente?.close().catch(() => {})
    proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

async function pedir(base, ruta, token, { metodo = 'GET', datos } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, { method: metodo,
    headers: { Authorization: `Bearer ${token}`,
      ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: datos === undefined ? undefined : JSON.stringify(datos) })
  return { status: respuesta.status, body: await respuesta.json() }
}

const datosPaciente = { fotografia: '/imagenes/existente.png', nombres: 'Paciente',
  apellidos: 'Ficticio', fechaNacimiento: '2000-01-01', sexo: 'FEMENINO',
  telefono: '55551234', direccion: 'Dirección de prueba',
  fechaInicioProceso: '2026-01-01', observacionesAdministrativas: '' }

test('códigos de pacientes con MongoDB local, migración y relaciones',
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
    assert.equal(mongoose.connection.name, 'sigca_test')
    process.env.JWT_SECRET = randomBytes(32).toString('hex')
    process.env.CORS_ORIGIN = 'http://localhost:5173'
    const { default: app } = await import('../src/app.js')
    const servidor = app.listen(0, '127.0.0.1')
    await new Promise((resolver, rechazar) => {
      servidor.once('listening', resolver)
      servidor.once('error', rechazar)
    })
    t.after(() => new Promise((resolver) => servidor.close(resolver)))
    const base = `http://127.0.0.1:${servidor.address().port}`

    const admin = await Usuario.create({ nombre: 'Administrador de prueba',
      correo: 'admin@example.test', passwordHash: await bcrypt.hash('SoloPrueba123', 4),
      rol: 'ADMINISTRADOR' })
    const token = crearToken(admin)
    const responsable = await Responsable.create({ codigo: 'RESPO-000001',
      fotografia: '/imagenes/existente.png',
      nombres: 'Responsable', apellidos: 'Ficticio', parentesco: 'Madre',
      telefono: '55551234', correo: 'responsable@example.test',
      direccion: 'Dirección de prueba' })
    const primeroId = new mongoose.Types.ObjectId()
    const segundoId = new mongoose.Types.ObjectId()
    const fotoId = randomUUID()
    const fotoPrivada = `/api/imagenes/privadas/${fotoId}`
    await ImagenCargada.create({ _id: fotoId, categoria: 'paciente',
      publicId: `sigca/test/paciente/${fotoId}`, valor: fotoPrivada, privada: true })
    await Paciente.init()
    await Paciente.collection.insertMany([
      { _id: segundoId, ...datosPaciente, fotografia: 'https://example.test/imagen.jpg',
        responsables: [responsable._id],
        estado: 'ACTIVO', createdAt: new Date('2024-01-02T00:00:00Z') },
      { _id: primeroId, ...datosPaciente, responsables: [responsable._id],
        estado: 'ACTIVO', createdAt: new Date('2024-01-01T00:00:00Z') },
    ])
    const cita = await Cita.create({ paciente: primeroId, servicio: new mongoose.Types.ObjectId(),
      profesional: admin._id, fecha: '2099-01-01', horaInicio: '10:00', horaFin: '10:01',
      minutosOcupados: [600], duracionMinutos: 1, precioCentavos: 100 })

    const antes = await pedir(base, '/api/pacientes', token,
      { metodo: 'POST', datos: { ...datosPaciente, fotografia: fotoPrivada,
        responsables: [] } })
    assert.equal(antes.status, 503)
    await assert.rejects(asignarCodigosExistentes('sigca_prod'), /no coincide/)
    const { stdout: salidaMigracion } = await ejecutarArchivo(process.execPath,
      [fileURLToPath(new URL('../scripts/asignarCodigosPacientes.js', import.meta.url)),
        '--db=sigca_test'], { env: { ...process.env, MONGO_URI: temporal.uri } })
    assert.match(salidaMigracion, /asignados: 2; faltantes: 0/)
    const primero = await Paciente.findById(primeroId)
    const segundo = await Paciente.findById(segundoId)
    assert.equal(primero.codigo, 'PAC-000001')
    assert.equal(segundo.codigo, 'PAC-000002')
    assert.equal(String(primero.responsables[0]), String(responsable._id))
    assert.equal(String((await Cita.findById(cita.id)).paciente), String(primeroId))
    const repeticion = await asignarCodigosExistentes('sigca_test')
    assert.equal(repeticion.asignados, 0)
    assert.equal(repeticion.ultimoNumero, 2)

    const cuerpo = { ...datosPaciente, fotografia: fotoPrivada,
      responsables: [String(responsable._id)] }
    const nuevoA = await pedir(base, '/api/pacientes', token, { metodo: 'POST', datos: cuerpo })
    const nuevoB = await pedir(base, '/api/pacientes', token, { metodo: 'POST', datos: cuerpo })
    assert.equal(nuevoA.status, 201)
    assert.equal(nuevoB.status, 201)
    assert.deepEqual([nuevoA.body.paciente.codigo, nuevoB.body.paciente.codigo],
      ['PAC-000003', 'PAC-000004'])
    const concurrentes = await Promise.all(Array.from({ length: 8 }, () =>
      pedir(base, '/api/pacientes', token, { metodo: 'POST', datos: cuerpo })))
    assert.ok(concurrentes.every((item) => item.status === 201))
    assert.equal(new Set(concurrentes.map((item) => item.body.paciente.codigo)).size, 8)
    assert.equal((await Contador.findById('pacientes')).secuencia, 12)
    await assert.rejects(Paciente.collection.insertOne({ ...datosPaciente,
      _id: new mongoose.Types.ObjectId(), codigo: 'PAC-000001' }), { code: 11000 })

    const buscar = await pedir(base, '/api/pacientes?buscar=PAC-000001', token)
    assert.equal(buscar.status, 200)
    assert.equal(buscar.body.pacientes.length, 1)
    assert.equal(buscar.body.pacientes[0].id, String(primeroId))
    const buscarId = await pedir(base, `/api/pacientes?buscar=${primeroId}`, token)
    const buscarNombre = await pedir(base, '/api/pacientes?buscar=Ficticio', token)
    assert.equal(buscarId.body.pacientes[0].codigo, 'PAC-000001')
    assert.ok(buscarNombre.body.pacientes.some((item) => item.id === String(primeroId)))
    const detalle = await pedir(base, `/api/pacientes/${primeroId}`, token)
    assert.equal(detalle.body.paciente.codigo, 'PAC-000001')
    const rechazoCrear = await pedir(base, '/api/pacientes', token,
      { metodo: 'POST', datos: { ...cuerpo, codigo: 'PAC-999999' } })
    const rechazoEditar = await pedir(base, `/api/pacientes/${primeroId}`, token,
      { metodo: 'PUT', datos: { ...cuerpo, codigo: 'PAC-999999' } })
    assert.equal(rechazoCrear.status, 400)
    assert.equal(rechazoEditar.status, 400)
    assert.equal((await Paciente.findById(primeroId)).codigo, 'PAC-000001')
    const edicionValida = await pedir(base, `/api/pacientes/${primeroId}`, token,
      { metodo: 'PUT', datos: { ...datosPaciente, telefono: '55550000',
        responsables: [String(responsable._id)] } })
    assert.equal(edicionValida.status, 200)
    assert.equal(edicionValida.body.paciente.codigo, 'PAC-000001')

    const asociado = await pedir(base, `/api/responsables/${responsable.id}`, token)
    const pacienteAsociado = asociado.body.responsable.pacientes.find(
      (item) => item.id === String(primeroId))
    assert.equal(pacienteAsociado?.codigo, 'PAC-000001')
    const opciones = await pedir(base,
      '/api/solicitudes-cita/opciones?buscarPaciente=PAC-000001', token)
    assert.equal(opciones.body.pacientes.length, 1)
    assert.equal(opciones.body.pacientes[0].codigo, 'PAC-000001')
    assert.equal(opciones.body.pacientes[0].id, String(primeroId))

    const previoId = new mongoose.Types.ObjectId()
    const pendienteId = new mongoose.Types.ObjectId()
    await Paciente.collection.insertMany([
      { _id: previoId, ...datosPaciente, codigo: 'PAC-000020',
        createdAt: new Date('2025-01-01T00:00:00Z') },
      { _id: pendienteId, ...datosPaciente,
        createdAt: new Date('2025-01-02T00:00:00Z') },
    ])
    const continuacion = await asignarCodigosExistentes('sigca_test')
    assert.equal(continuacion.asignados, 1)
    assert.equal((await Paciente.findById(previoId)).codigo, 'PAC-000020')
    assert.equal((await Paciente.findById(pendienteId)).codigo, 'PAC-000021')
    assert.equal((await asignarCodigosExistentes('sigca_test')).asignados, 0)
    const posterior = await pedir(base, '/api/pacientes', token,
      { metodo: 'POST', datos: cuerpo })
    assert.equal(posterior.body.paciente.codigo, 'PAC-000022')
    assert.equal((await Paciente.findById(primeroId)).fotografia, '/imagenes/existente.png')
    assert.equal((await Paciente.findById(segundoId)).fotografia, 'https://example.test/imagen.jpg')
    const conUrl = await pedir(base, '/api/pacientes', token,
      { metodo: 'POST', datos: { ...cuerpo, fotografia: 'https://example.test/imagen.jpg' } })
    assert.equal(conUrl.status, 400)
    console.log('MongoDB temporal: códigos, concurrencia, búsqueda, inmutabilidad y ObjectId correctos')
  })
