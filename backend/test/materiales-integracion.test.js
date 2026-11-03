import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import AsignacionMaterial from '../src/models/AsignacionMaterial.js'
import Cita from '../src/models/Cita.js'
import Material from '../src/models/Material.js'
import Paciente from '../src/models/Paciente.js'
import Usuario from '../src/models/Usuario.js'
import { crearToken } from '../src/middleware/autenticacion.js'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function puertoLibre() {
  const servidor = createServer()
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar)
    servidor.listen(0, '127.0.0.1', resolver)
  })
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  return puerto
}

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-materiales-'))
  let proceso
  try {
    const puerto = await puertoLibre()
    proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
      '--bind_ip', '127.0.0.1', '--replSet', 'sigca-test',
      '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
    proceso.on('error', () => {})
    for (let intento = 0; intento < 60; intento += 1) {
      try {
        await mongoose.connect(`mongodb://127.0.0.1:${puerto}/sigca_test`,
          { directConnection: true, serverSelectionTimeoutMS: 300 })
        break
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició MongoDB temporal')
        await pausa(100)
      }
    }
    if (mongoose.connection.readyState !== 1) throw new Error('MongoDB temporal no respondió')
    await mongoose.connection.db.admin().command({ replSetInitiate: {
      _id: 'sigca-test', members: [{ _id: 0, host: `127.0.0.1:${puerto}` }],
    } })
    await mongoose.disconnect()
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/sigca_test`,
      { replicaSet: 'sigca-test', serverSelectionTimeoutMS: 10000 })
    assert.equal(mongoose.connection.name, 'sigca_test')
    return { carpeta, proceso }
  } catch (error) {
    await mongoose.disconnect()
    if (proceso?.exitCode === null) proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

async function pedir(base, ruta, credencial, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}),
      ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  })
  return { status: respuesta.status, body: await respuesta.json() }
}

const datosPaciente = { fotografia: '/imagenes/ficticia.jpg', nombres: 'Paciente',
  apellidos: 'Ficticio', fechaNacimiento: '2000-01-01', sexo: 'FEMENINO',
  telefono: '55551234', direccion: 'Dirección ficticia', fechaInicioProceso: '2026-01-01',
  responsables: [] }

test('RF-09 y RN-09 persisten y aíslan permisos en MongoDB temporal local', async (t) => {
  const temporal = await mongoTemporal()
  t.after(async () => {
    await mongoose.disconnect()
    if (temporal.proceso.exitCode === null) {
      temporal.proceso.kill('SIGTERM')
      await new Promise((resolver) => temporal.proceso.once('exit', resolver))
    }
    await rm(temporal.carpeta, { recursive: true, force: true })
  })

  process.env.DOTENV_CONFIG_PATH = '/dev/null'
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

  const [admin, profesional, otroProfesional, recepcion] = await Usuario.create([
    { nombre: 'Administrador ficticio', correo: 'admin-material@example.test',
      passwordHash: 'prueba', rol: 'ADMINISTRADOR' },
    { nombre: 'Profesional ficticio', correo: 'profesional-material@example.test',
      passwordHash: 'prueba', rol: 'PROFESIONAL' },
    { nombre: 'Otro profesional ficticio', correo: 'otro-material@example.test',
      passwordHash: 'prueba', rol: 'PROFESIONAL' },
    { nombre: 'Recepción ficticia', correo: 'recepcion-material@example.test',
      passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
  ])
  const adminToken = crearToken(admin)
  const profesionalToken = crearToken(profesional)
  const otroToken = crearToken(otroProfesional)
  const recepcionToken = crearToken(recepcion)
  const [paciente, ajeno, inactivo] = await Paciente.create([
    { ...datosPaciente, codigo: 'PAC-000001' },
    { ...datosPaciente, codigo: 'PAC-000002', nombres: 'Paciente ajeno' },
    { ...datosPaciente, codigo: 'PAC-000003', estado: 'INACTIVO' },
  ])
  const servicio = new mongoose.Types.ObjectId()
  await Cita.create([
    { paciente: paciente.id, servicio, profesional: profesional.id,
      fecha: '2027-01-01', horaInicio: '10:00', horaFin: '11:00',
      minutosOcupados: [600], duracionMinutos: 60, precioCentavos: 100 },
    { paciente: ajeno.id, servicio, profesional: otroProfesional.id,
      fecha: '2027-01-01', horaInicio: '11:00', horaFin: '12:00',
      minutosOcupados: [660], duracionMinutos: 60, precioCentavos: 100 },
    { paciente: inactivo.id, servicio, profesional: profesional.id,
      fecha: '2027-01-01', horaInicio: '12:00', horaFin: '13:00',
      minutosOcupados: [720], duracionMinutos: 60, precioCentavos: 100 },
  ])

  const rutaMateriales = '/api/materiales'
  const rutaAsignaciones = '/api/asignaciones-materiales'
  const datosMaterial = { titulo: 'Guía ficticia', descripcion: 'Contenido de prueba',
    tipo: 'Documento', enlace: '/educacion' }
  assert.equal((await pedir(base, rutaMateriales, null)).status, 401)
  assert.equal((await pedir(base, rutaMateriales, recepcionToken)).status, 403)
  assert.equal((await pedir(base, rutaMateriales, profesionalToken, 'POST', datosMaterial)).status, 403)
  const creado = await pedir(base, rutaMateriales, adminToken, 'POST', datosMaterial)
  assert.equal(creado.status, 201)
  const materialId = creado.body.material.id
  assert.equal(creado.body.material.estado, 'ACTIVO')
  assert.ok(Date.parse(creado.body.material.fechaRegistro))
  assert.ok(await Material.exists({ _id: materialId }))
  assert.equal((await pedir(base, `${rutaMateriales}/${materialId}`, profesionalToken)).status, 200)

  const actualizado = await pedir(base, `${rutaMateriales}/${materialId}`, adminToken, 'PUT',
    { ...datosMaterial, titulo: 'Guía actualizada', tipo: 'Lectura' })
  assert.equal(actualizado.status, 200)
  assert.equal((await Material.findById(materialId)).titulo, 'Guía actualizada')
  assert.equal((await pedir(base, `${rutaMateriales}/${materialId}/estado`, adminToken,
    'PATCH', { estado: 'INVALIDO' })).status, 400)
  assert.equal((await pedir(base, `${rutaMateriales}/${materialId}`, adminToken, 'DELETE')).status, 404)

  const opciones = '/api/asignaciones-materiales/opciones?soloPacientes=1&paginaPacientes=0'
  const autorizados = await pedir(base, opciones, profesionalToken)
  assert.equal(autorizados.status, 200)
  assert.deepEqual(autorizados.body.pacientes.map((item) => item.id), [paciente.id])
  assert.deepEqual(Object.keys(autorizados.body.pacientes[0]).sort(), ['codigo', 'id', 'nombre'])
  assert.equal((await pedir(base, opciones, recepcionToken)).status, 403)
  const datosAsignacion = { material: materialId, paciente: paciente.id }
  assert.equal((await pedir(base, rutaAsignaciones, recepcionToken, 'POST', datosAsignacion)).status, 403)
  assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST',
    { ...datosAsignacion, paciente: ajeno.id })).status, 403)
  assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST',
    { ...datosAsignacion, paciente: inactivo.id })).status, 409)
  assert.equal((await pedir(base, `${rutaAsignaciones}?paciente=${paciente.id}`, otroToken)).status, 403)

  assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST', datosAsignacion)).status, 201)
  assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST', datosAsignacion)).status, 201)
  assert.equal(await AsignacionMaterial.countDocuments({ paciente: paciente.id, material: materialId }), 2)
  const actualizarPaciente = Paciente.updateOne
  let desactivarPaciente = true
  Paciente.updateOne = async function (...argumentos) {
    if (desactivarPaciente) {
      desactivarPaciente = false
      await Paciente.collection.updateOne({ _id: paciente._id }, { $set: { estado: 'INACTIVO' } })
    }
    return actualizarPaciente.apply(this, argumentos)
  }
  try {
    assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST', datosAsignacion)).status, 409)
    assert.equal(await AsignacionMaterial.countDocuments({ paciente: paciente.id, material: materialId }), 2)
  } finally {
    Paciente.updateOne = actualizarPaciente
    await Paciente.collection.updateOne({ _id: paciente._id }, { $set: { estado: 'ACTIVO' } })
  }
  const actualizarMaterial = Material.updateOne
  let desactivarMaterial = true
  Material.updateOne = async function (...argumentos) {
    if (desactivarMaterial) {
      desactivarMaterial = false
      await Material.collection.updateOne({ _id: new mongoose.Types.ObjectId(materialId) },
        { $set: { estado: 'INACTIVO' } })
    }
    return actualizarMaterial.apply(this, argumentos)
  }
  try {
    assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST', datosAsignacion)).status, 409)
    assert.equal(await AsignacionMaterial.countDocuments({ paciente: paciente.id, material: materialId }), 2)
  } finally {
    Material.updateOne = actualizarMaterial
    await Material.collection.updateOne({ _id: new mongoose.Types.ObjectId(materialId) },
      { $set: { estado: 'ACTIVO' } })
  }
  const historia = await pedir(base, `${rutaAsignaciones}?paciente=${paciente.id}`, profesionalToken)
  assert.equal(historia.status, 200)
  assert.equal(historia.body.asignaciones.length, 2)
  assert.equal(historia.body.asignaciones[0].material.titulo, 'Guía actualizada')

  const desactivado = await pedir(base, `${rutaMateriales}/${materialId}/estado`, adminToken,
    'PATCH', { estado: 'INACTIVO' })
  assert.equal(desactivado.status, 200)
  assert.equal((await pedir(base, rutaMateriales, profesionalToken)).body.materiales.length, 0)
  assert.equal((await pedir(base, `${rutaMateriales}/${materialId}`, profesionalToken)).status, 404)
  assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST', datosAsignacion)).status, 409)
  assert.equal((await pedir(base, rutaMateriales, adminToken)).body.materiales[0].estado, 'INACTIVO')
  const historiaInactiva = await pedir(base, `${rutaAsignaciones}?paciente=${paciente.id}`, profesionalToken)
  assert.equal(historiaInactiva.body.asignaciones[0].material.estado, 'INACTIVO')
  assert.equal(await Material.countDocuments({ _id: materialId }), 1)
  assert.equal((await pedir(base, `${rutaAsignaciones}/${historia.body.asignaciones[0].id}`,
    adminToken, 'DELETE')).status, 404)
  assert.equal(await AsignacionMaterial.countDocuments({ paciente: paciente.id }), 2)

  assert.equal((await pedir(base, `${rutaMateriales}/${materialId}/estado`, adminToken,
    'PATCH', { estado: 'ACTIVO' })).status, 200)
  await Paciente.updateOne({ _id: paciente.id }, { $set: { estado: 'INACTIVO' } })
  assert.equal((await pedir(base, rutaAsignaciones, profesionalToken, 'POST', datosAsignacion)).status, 409)
  assert.equal((await pedir(base, opciones, profesionalToken)).body.pacientesTotal, 0)
  assert.equal((await pedir(base, `${rutaAsignaciones}?paciente=${paciente.id}`,
    profesionalToken)).body.asignaciones.length, 2)
  assert.equal(await AsignacionMaterial.countDocuments({ paciente: paciente.id }), 2)
})
