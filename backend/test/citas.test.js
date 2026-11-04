import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { v2 as cloudinary } from 'cloudinary'
import Cita from '../src/models/Cita.js'
import ImagenCargada from '../src/models/ImagenCargada.js'
import Horario, { DIAS } from '../src/models/Horario.js'
import Paciente from '../src/models/Paciente.js'
import Servicio from '../src/models/Servicio.js'
import SolicitudCita from '../src/models/SolicitudCita.js'
import Usuario from '../src/models/Usuario.js'
import { crearToken } from '../src/middleware/autenticacion.js'
import { ahoraGuatemala, fechaMaximaGuatemala } from '../src/services/prepararCita.js'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function iniciarMongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-citas-'))
  const pruebaPuerto = createServer()
  await new Promise((resolver, rechazar) => pruebaPuerto.listen(0, '127.0.0.1',
    (error) => error ? rechazar(error) : resolver()))
  const puerto = pruebaPuerto.address().port
  await new Promise((resolver) => pruebaPuerto.close(resolver))
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_citas_prueba',
    '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  const uriDirecta = `mongodb://127.0.0.1:${puerto}/?directConnection=true`
  let cliente
  try {
    for (let intento = 0; intento < 60; intento += 1) {
      try {
        cliente = await new mongoose.mongo.MongoClient(uriDirecta,
          { serverSelectionTimeoutMS: 300 }).connect()
        break
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició MongoDB temporal')
        await pausa(100)
      }
    }
    if (!cliente) throw new Error('MongoDB temporal no respondió')
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_citas_prueba',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    cliente = null
    await mongoose.connect(`mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_citas_prueba`,
      { serverSelectionTimeoutMS: 10000 })
    return { carpeta, proceso }
  } catch (error) {
    await cliente?.close().catch(() => {})
    proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

async function pedir(base, ruta, token, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, { method: metodo,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: datos === undefined ? undefined : JSON.stringify(datos) })
  return { status: respuesta.status, body: await respuesta.json() }
}

test('RF-07 y RF-08 con MongoDB temporal: permisos, agenda, historial y calendario', async (t) => {
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

  const [admin, recepcion, profesionalA, profesionalB, personalizado] = await Usuario.create([
    { nombre: 'Administración ficticia', correo: 'admin-citas@example.test', passwordHash: 'prueba', rol: 'ADMINISTRADOR' },
    { nombre: 'Recepción ficticia', correo: 'recepcion-citas@example.test', passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
    { nombre: 'Profesional A', correo: 'profesional-a@example.test', passwordHash: 'prueba', rol: 'PROFESIONAL' },
    { nombre: 'Profesional B', correo: 'profesional-b@example.test', passwordHash: 'prueba', rol: 'PROFESIONAL' },
    { nombre: 'Rol personalizado', correo: 'personalizado-citas@example.test', passwordHash: 'prueba', rol: 'ROL_PRUEBA' },
  ])
  const tokens = Object.fromEntries([admin, recepcion, profesionalA, profesionalB, personalizado]
    .map((u) => [u.rol === 'PROFESIONAL' ? String(u.id) : u.rol, crearToken(u)]))
  const tokenA = tokens[String(profesionalA.id)]
  const tokenB = tokens[String(profesionalB.id)]
  const paciente = await Paciente.create({ codigo: 'PAC-000001', fotografia: '/imagenes/prueba.jpg',
    nombres: 'Paciente', apellidos: 'Ficticio', fechaNacimiento: '2000-01-01',
    sexo: 'FEMENINO', telefono: '55551234', direccion: 'Dirección ficticia',
    fechaInicioProceso: '2026-01-01', responsables: [] })
  const menor = await Paciente.create({ codigo: 'PAC-000002', fotografia: '/imagenes/prueba.jpg',
    nombres: 'Paciente', apellidos: 'Menor', fechaNacimiento: '2090-01-01',
    sexo: 'MASCULINO', telefono: '55551234', direccion: 'Dirección ficticia',
    fechaInicioProceso: '2090-01-01', responsables: [] })
  const servicio = await Servicio.create({ codigo: 'SERV-INT-0001', nombre: 'Servicio ficticio',
    descripcion: 'Prueba local', duracionMinutos: 60, precioCentavos: 25000,
    imagen: '/imagenes/prueba.jpg' })
  await Horario.create(DIAS.map((dia) => ({ dia, activo: true,
    intervalos: [{ horaInicio: '08:00', horaFin: '18:00' }] })))
  await Cita.init()
  const fechaObjeto = new Date(`${ahoraGuatemala().fecha}T12:00:00Z`)
  fechaObjeto.setUTCDate(fechaObjeto.getUTCDate() + 30)
  const fecha = fechaObjeto.toISOString().slice(0, 10)
  const nueva = { paciente: paciente.id, servicio: servicio.id, profesional: profesionalA.id,
    fecha, horaInicio: '10:00', observacionesAdministrativas: 'Nota ficticia' }

  assert.equal((await pedir(base, '/api/citas', null)).status, 401)
  assert.equal((await pedir(base, '/api/citas', tokens.ROL_PRUEBA)).status, 403)
  assert.equal((await pedir(base, '/api/citas', tokenA, 'POST', nueva)).status, 403)
  assert.equal((await pedir(base, '/api/citas/opciones', tokenA)).status, 403)
  assert.equal((await pedir(base, '/api/citas?fecha=fecha-invalida', tokens.ADMINISTRADOR)).status, 400)
  const opciones = await pedir(base, '/api/citas/opciones?buscarPaciente=PAC-000001', tokens.RECEPCIONISTA)
  assert.equal(opciones.status, 200)
  assert.equal(opciones.body.pacientes[0].id, paciente.id)
  assert.equal(opciones.body.servicios[0].precioCentavos, 25000)
  await Paciente.insertMany(Array.from({ length: 105 }, (_, indice) => ({
    codigo: `PAC-${String(indice + 3).padStart(6, '0')}`, fotografia: '/imagenes/prueba.jpg',
    nombres: 'Prueba', apellidos: 'Buscable', fechaNacimiento: '2000-01-01',
    sexo: 'FEMENINO', telefono: '55551234', direccion: 'Dirección ficticia',
    fechaInicioProceso: '2026-01-01', responsables: [],
  })))
  const primeraPagina = await pedir(base,
    '/api/citas/opciones?buscarPaciente=Buscable&soloPacientes=1', tokens.RECEPCIONISTA)
  const ultimaPagina = await pedir(base,
    '/api/citas/opciones?buscarPaciente=Buscable&paginaPacientes=10&soloPacientes=1', tokens.RECEPCIONISTA)
  assert.equal(primeraPagina.body.pacientes.length, 10)
  assert.equal(primeraPagina.body.pacientesTotal, 105)
  assert.equal(ultimaPagina.body.pacientes.length, 5)
  const pacientesPaginaDos = await pedir(base, '/api/pacientes?buscar=Buscable&pagina=1',
    tokens.RECEPCIONISTA)
  assert.equal(pacientesPaginaDos.body.pacientes.length, 40)
  assert.equal(pacientesPaginaDos.body.total, 105)
  assert.equal(pacientesPaginaDos.body.totalPaginas, 3)
  assert.equal(pacientesPaginaDos.body.hayMas, true)
  const pacientesPaginaTres = await pedir(base, '/api/pacientes?buscar=Buscable&pagina=2',
    tokens.RECEPCIONISTA)
  assert.equal(pacientesPaginaTres.body.pacientes.length, 25)
  assert.equal(pacientesPaginaTres.body.hayMas, false)
  await Servicio.insertMany(Array.from({ length: 101 }, (_, indice) => ({
    codigo: `SERV-INT-${String(indice + 2).padStart(4, '0')}`,
    nombre: `Servicio de prueba ${indice + 2}`, descripcion: 'Prueba local',
    duracionMinutos: 60, precioCentavos: 25000, imagen: '/imagenes/prueba.jpg',
  })))
  const opcionesServicios = await pedir(base, '/api/servicios/opciones')
  assert.equal(opcionesServicios.status, 200)
  assert.equal(opcionesServicios.body.servicios.length, 102)
  assert.equal((await pedir(base, '/api/citas/opciones', tokens.ADMINISTRADOR)).body.servicios.length, 102)

  const creada = await pedir(base, '/api/citas', tokens.RECEPCIONISTA, 'POST', nueva)
  assert.equal(creada.status, 201)
  const id = creada.body.cita.id
  assert.equal(creada.body.cita.estado, 'PENDIENTE')
  assert.equal(creada.body.cita.horaFin, '11:00')
  assert.equal(creada.body.cita.precioCentavos, 25000)
  assert.equal(creada.body.cita.solicitudCita, null)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, fecha: '3010-01-01' })).status, 400)
  const dia365 = fechaMaximaGuatemala()
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, fecha: dia365, horaInicio: '08:00' })).status, 201)
  const fueraDeRango = new Date(`${dia365}T12:00:00Z`)
  fueraDeRango.setUTCDate(fueraDeRango.getUTCDate() + 1)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, fecha: fueraDeRango.toISOString().slice(0, 10) })).status, 400)
  const citaHeredada = await Cita.create({ paciente: paciente.id, servicio: servicio.id,
    profesional: profesionalA.id, fecha: '3010-01-01', horaInicio: '10:00', horaFin: '11:00',
    minutosOcupados: Array.from({ length: 60 }, (_, indice) => 600 + indice),
    duracionMinutos: 60, precioCentavos: 25000 })
  const heredadaLeida = await pedir(base, `/api/citas/${citaHeredada.id}`, tokens.ADMINISTRADOR)
  assert.equal(heredadaLeida.status, 200)
  assert.equal(heredadaLeida.body.cita.fecha, '3010-01-01')
  await Servicio.updateOne({ _id: servicio.id }, { $set: { precioCentavos: 30000,
    duracionMinutos: 90 } })
  assert.equal((await pedir(base, `/api/citas/${id}`, tokens.ADMINISTRADOR)).body.cita.precioCentavos, 25000)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, fecha: '2020-01-01' })).status, 400)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, horaInicio: '17:30' })).status, 409)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, paciente: menor.id, horaInicio: '12:00' })).status, 409)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, horaInicio: '10:30' })).status, 409)

  const solicitud = await SolicitudCita.create({ nombreSolicitante: 'Persona ficticia',
    correo: 'solicitud@example.test', telefono: '55551234', servicio: servicio.id,
    fechaPreferida: fecha, estado: 'ATENDIDA' })
  const convertida = await Cita.create({ paciente: paciente.id, servicio: servicio.id,
    profesional: profesionalB.id, solicitudCita: solicitud.id,
    fecha, horaInicio: '09:00', horaFin: '10:00',
    minutosOcupados: Array.from({ length: 60 }, (_, i) => 540 + i),
    duracionMinutos: 60, precioCentavos: 25000 })
  await SolicitudCita.updateOne({ _id: solicitud.id }, { $set: { cita: convertida.id } })
  const historia = await pedir(base, `/api/citas?paciente=${paciente.id}`, tokens.ADMINISTRADOR)
  assert.equal(historia.status, 200)
  assert.equal(historia.body.total, 4)
  assert.ok(historia.body.citas.some((c) => c.solicitudCita === solicitud.id))
  const filtroProfesional = await pedir(base,
    `/api/citas?profesional=${profesionalB.id}&fecha=${fecha}&estado=PENDIENTE`, tokens.ADMINISTRADOR)
  assert.equal(filtroProfesional.body.total, 1)
  assert.equal(filtroProfesional.body.citas[0].id, convertida.id)
  const mes = await pedir(base, `/api/citas/calendario?mes=${fecha.slice(0, 7)}`, tokens.ADMINISTRADOR)
  assert.equal(mes.body.dias.find((d) => d.fecha === fecha).total, 2)
  assert.equal((await pedir(base, `/api/citas/calendario?mes=${fecha.slice(0, 7)}`, tokenA))
    .body.dias.find((d) => d.fecha === fecha).total, 1)
  assert.equal((await pedir(base, `/api/citas?profesional=${profesionalB.id}`, tokenA)).status, 403)
  assert.equal((await pedir(base, `/api/citas/${convertida.id}`, tokenA)).status, 404)
  const propia = await pedir(base, `/api/citas/${id}`, tokenA)
  assert.equal(propia.status, 200)
  assert.equal(propia.body.cita.paciente.codigo, 'PAC-000001')
  assert.equal(Object.hasOwn(propia.body.cita, 'observacionesAdministrativas'), false)
  assert.equal(propia.body.cita.paciente.imagen, '/imagenes/prueba.jpg')
  const idFotoPaciente = randomUUID()
  const idFotoProfesional = randomUUID()
  const rutaPaciente = `/api/imagenes/privadas/${idFotoPaciente}`
  const rutaProfesional = `/api/imagenes/privadas/${idFotoProfesional}`
  await ImagenCargada.create([
    { _id: idFotoPaciente, categoria: 'paciente', publicId: 'sigca/test/paciente/ficticia',
      privada: true, valor: rutaPaciente },
    { _id: idFotoProfesional, categoria: 'usuario', publicId: 'sigca/test/usuario/ficticia',
      privada: true, valor: rutaProfesional, propietario: profesionalA.id },
  ])
  await Paciente.updateOne({ _id: paciente.id }, { $set: { fotografia: rutaPaciente } })
  await Usuario.updateOne({ _id: profesionalA.id }, { $set: { fotografia: rutaProfesional } })
  const detalleConFotos = await pedir(base, `/api/citas/${id}`, tokenA)
  assert.equal(detalleConFotos.body.cita.paciente.imagen, `/api/citas/${id}/imagenes/paciente`)
  assert.equal(detalleConFotos.body.cita.profesional.imagen, `/api/citas/${id}/imagenes/profesional`)
  assert.equal(JSON.stringify(detalleConFotos.body).includes('api.cloudinary.com'), false)
  assert.equal((await fetch(`${base}/api/citas/${id}/imagenes/paciente`)).status, 401)
  assert.equal((await fetch(`${base}/api/citas/${id}/imagenes/paciente`,
    { headers: { Authorization: `Bearer ${tokenB}` } })).status, 404)
  process.env.CLOUDINARY_CLOUD_NAME = 'prueba-local'
  process.env.CLOUDINARY_API_KEY = 'prueba-local'
  process.env.CLOUDINARY_API_SECRET = 'prueba-local'
  process.env.CLOUDINARY_FOLDER_PREFIX = 'sigca/test'
  const descargaOriginal = cloudinary.utils.private_download_url
  const fetchOriginal = global.fetch
  cloudinary.utils.private_download_url = () => 'https://api.cloudinary.com/prueba-local'
  global.fetch = (url, opciones) => String(url).startsWith('https://api.cloudinary.com/') ?
    Promise.resolve(new Response(Uint8Array.from([255, 216, 255, 217]),
      { headers: { 'content-type': 'image/jpeg' } })) : fetchOriginal(url, opciones)
  try {
    for (const token of [tokens.ADMINISTRADOR, tokens.RECEPCIONISTA, tokenA]) {
      for (const tipo of ['paciente', 'profesional']) {
        const respuesta = await fetch(`${base}/api/citas/${id}/imagenes/${tipo}`,
          { headers: { Authorization: `Bearer ${token}` } })
        assert.equal(respuesta.status, 200)
        assert.equal(respuesta.headers.get('content-type'), 'image/jpeg')
      }
    }
  } finally {
    global.fetch = fetchOriginal
    cloudinary.utils.private_download_url = descargaOriginal
    delete process.env.CLOUDINARY_CLOUD_NAME
    delete process.env.CLOUDINARY_API_KEY
    delete process.env.CLOUDINARY_API_SECRET
    delete process.env.CLOUDINARY_FOLDER_PREFIX
  }

  assert.equal((await pedir(base, `/api/citas/${id}/estado`, tokens.RECEPCIONISTA,
    'PATCH', { estado: 'CONFIRMADA' })).status, 200)
  assert.equal((await pedir(base, `/api/citas/${id}/estado`, tokenA,
    'PATCH', { estado: 'CANCELADA' })).status, 403)
  assert.equal((await pedir(base, `/api/citas/${id}`, tokens.ADMINISTRADOR, 'PUT',
    { fecha, horaInicio: '09:30', profesional: profesionalB.id,
      observacionesAdministrativas: '' })).status, 409)
  assert.equal((await pedir(base, `/api/citas/${id}`, tokens.ADMINISTRADOR, 'PUT',
    { fecha: '3010-01-01', horaInicio: '10:30', profesional: profesionalB.id,
      observacionesAdministrativas: '' })).status, 400)
  assert.equal((await pedir(base, `/api/citas/${id}`, tokens.ADMINISTRADOR)).body.cita.fecha, fecha)
  const reprogramada = await pedir(base, `/api/citas/${id}`, tokens.ADMINISTRADOR, 'PUT',
    { fecha, horaInicio: '10:30', profesional: profesionalB.id,
      observacionesAdministrativas: 'Reprogramación ficticia' })
  assert.equal(reprogramada.status, 200)
  assert.equal(reprogramada.body.cita.horaFin, '11:30')
  assert.equal(reprogramada.body.cita.duracionMinutos, 60)
  assert.equal(reprogramada.body.cita.precioCentavos, 25000)
  assert.equal(reprogramada.body.cita.estado, 'CONFIRMADA')
  assert.equal(reprogramada.body.cita.paciente.id, paciente.id)
  assert.equal(reprogramada.body.cita.servicio.id, servicio.id)
  assert.equal((await pedir(base, `/api/citas/${id}/estado`, tokenA,
    'PATCH', { estado: 'COMPLETADA' })).status, 404)
  assert.equal((await pedir(base, `/api/citas/${id}/estado`, tokenB,
    'PATCH', { estado: 'COMPLETADA' })).status, 200)
  assert.equal((await pedir(base, `/api/citas/${id}`, tokens.ADMINISTRADOR, 'PUT',
    { fecha, horaInicio: '14:00', profesional: profesionalB.id,
      observacionesAdministrativas: '' })).status, 409)
  assert.equal((await pedir(base, `/api/citas/${id}/estado`, tokens.ADMINISTRADOR,
    'PATCH', { estado: 'CANCELADA' })).status, 409)

  const cancelable = await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, horaInicio: '14:00' })
  assert.equal(cancelable.status, 201)
  const cancelableId = cancelable.body.cita.id
  assert.equal((await pedir(base, `/api/citas/${cancelableId}/estado`, tokens.ADMINISTRADOR,
    'PATCH', { estado: 'CANCELADA' })).status, 200)
  assert.equal((await pedir(base, `/api/citas/${cancelableId}/estado`, tokenA,
    'PATCH', { estado: 'COMPLETADA' })).status, 409)
  assert.equal((await pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
    { ...nueva, horaInicio: '14:00' })).status, 201)

  const simultaneas = await Promise.all([1, 2].map(() =>
    pedir(base, '/api/citas', tokens.ADMINISTRADOR, 'POST',
      { ...nueva, horaInicio: '16:00' })))
  assert.deepEqual(simultaneas.map((r) => r.status).sort(), [201, 409])
  assert.equal(await Cita.countDocuments({ fecha, profesional: profesionalA.id,
    horaInicio: '16:00', estado: 'PENDIENTE' }), 1)
})
