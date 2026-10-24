import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import app from '../src/app.js'
import Usuario from '../src/models/Usuario.js'
import Servicio from '../src/models/Servicio.js'
import Horario, { DIAS } from '../src/models/Horario.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')

const creados = { usuarios: [], servicios: [], horarios: [] }
const sufijo = randomBytes(8).toString('hex')
const passwordPrueba = randomBytes(18).toString('base64url')
let servidor
let base
let comprobaciones = 0

function verificar(actual, esperado, descripcion) {
  assert.equal(actual, esperado, descripcion)
  comprobaciones += 1
}

async function pedir(ruta, { metodo = 'GET', token, datos } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  })
  return { status: respuesta.status, body: await respuesta.json() }
}

async function crearCuenta(rol) {
  const correo = `${rol.toLowerCase()}-modulo4-${sufijo}@example.test`
  const usuario = await Usuario.create({ nombre: `${rol} ficticio`, correo,
    passwordHash: await bcrypt.hash(passwordPrueba, 12), rol })
  creados.usuarios.push(usuario.id)
  const login = await pedir('/api/auth/login', { metodo: 'POST',
    datos: { correo, password: passwordPrueba } })
  verificar(login.status, 200, `Login de ${rol}`)
  return login.body.token
}

async function ejecutar() {
  if (!process.env.MONGO_URI) throw new Error('No hay URI local para la prueba')
  const uri = new URL(process.env.MONGO_URI)
  uri.pathname = '/sigca_test'
  await mongoose.connect(uri.toString(), { serverSelectionTimeoutMS: 5000 })
  if (mongoose.connection.name !== 'sigca_test') {
    throw new Error('La conexión no apunta a sigca_test')
  }

  servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver, rechazar) => {
    servidor.once('listening', resolver)
    servidor.once('error', rechazar)
  })
  base = `http://127.0.0.1:${servidor.address().port}`

  const admin = await crearCuenta('ADMINISTRADOR')
  const recepcion = await crearCuenta('RECEPCIONISTA')
  const profesional = await crearCuenta('PROFESIONAL')
  const buscar = encodeURIComponent(`Prueba servicio ${sufijo}`)
  const datosServicio = { nombre: `Prueba servicio ${sufijo}`,
    descripcion: 'Servicio ficticio para comprobar la fase 4', duracionMinutos: 50,
    precioCentavos: 25025, imagen: '/imagenes/servicio-ficticio.png' }

  verificar((await pedir('/api/servicios', { metodo: 'POST', datos: datosServicio })).status, 401,
    'Crear servicio requiere sesión')
  verificar((await pedir('/api/servicios', { metodo: 'POST', token: recepcion,
    datos: datosServicio })).status, 403, 'Recepción no modifica servicios')
  verificar((await pedir('/api/servicios', { metodo: 'POST', token: profesional,
    datos: datosServicio })).status, 403, 'Profesional no modifica servicios')
  verificar((await pedir('/api/servicios', { metodo: 'POST', token: admin,
    datos: { ...datosServicio, precioCentavos: 250.25 } })).status, 400,
  'Se rechaza un precio fraccionario en centavos')
  verificar((await pedir('/api/servicios', { metodo: 'POST', token: admin,
    datos: { ...datosServicio, duracionMinutos: 0 } })).status, 400,
  'Se rechaza duración cero')
  verificar((await pedir(`/api/servicios?buscar=${buscar}`)).body.servicios.length, 0,
    'La búsqueda ficticia inicia vacía')

  const creado = await pedir('/api/servicios', { metodo: 'POST', token: admin,
    datos: datosServicio })
  verificar(creado.status, 201, 'Se crea servicio')
  const idServicio = creado.body.servicio.id
  creados.servicios.push(idServicio)
  verificar(creado.body.servicio.precioCentavos, 25025, 'Se conservan centavos exactos')
  verificar((await Servicio.findById(idServicio)).precioCentavos, 25025,
    'MongoDB guarda centavos enteros')
  verificar((await pedir(`/api/servicios?buscar=${buscar}`)).body.servicios.length, 1,
    'El activo aparece en la consulta pública')
  verificar((await pedir(`/api/servicios/${idServicio}`)).status, 200,
    'Se consulta detalle público activo')
  verificar((await pedir('/api/servicios/administracion', { token: recepcion })).status, 200,
    'Recepción consulta servicios internos')
  verificar((await pedir('/api/servicios/administracion', { token: profesional })).status, 403,
    'Profesional no accede a administración')

  const actualizado = await pedir(`/api/servicios/${idServicio}`, { metodo: 'PUT', token: admin,
    datos: { ...datosServicio, duracionMinutos: 60, precioCentavos: 30000 } })
  verificar(actualizado.status, 200, 'Se modifica servicio')
  verificar(actualizado.body.servicio.precioCentavos, 30000, 'Se actualiza importe')
  verificar(actualizado.body.servicio.duracionMinutos, 60, 'Se actualiza duración')
  verificar((await pedir(`/api/servicios/${idServicio}/estado`, { metodo: 'PATCH', token: admin,
    datos: { estado: 'INACTIVO' } })).status, 200, 'Se desactiva servicio')
  verificar((await pedir(`/api/servicios?buscar=${buscar}`)).body.servicios.length, 0,
    'El inactivo desaparece del listado público')
  verificar((await pedir(`/api/servicios/${idServicio}`)).status, 404,
    'El detalle público no revela un inactivo')
  verificar((await pedir(`/api/servicios?buscar=${buscar}&estado=INACTIVO`)).status, 400,
    'Un filtro público no revela inactivos')
  verificar((await pedir(`/api/servicios/administracion?buscar=${buscar}&estado=INACTIVO`,
    { token: recepcion })).body.servicios.length, 1,
  'Recepción consulta el inactivo internamente')

  const diasOcupados = new Set((await Horario.find().select('dia')).map((item) => item.dia))
  const diaLibre = DIAS.find((dia) => !diasOcupados.has(dia))
  if (!diaLibre) throw new Error('No hay día libre para probar horarios sin alterar datos existentes')
  const rutaDia = `/api/horarios/${diaLibre}`
  const intervalos = [
    { horaInicio: '13:00', horaFin: '17:00' },
    { horaInicio: '08:00', horaFin: '12:00' },
  ]
  verificar((await pedir(rutaDia, { metodo: 'PUT', datos: { activo: true, intervalos } })).status,
    401, 'Modificar horario requiere sesión')
  verificar((await pedir(rutaDia, { metodo: 'PUT', token: recepcion,
    datos: { activo: true, intervalos } })).status, 403,
  'Recepción no modifica horarios')
  verificar((await pedir('/api/horarios/administracion', { token: profesional })).status, 403,
    'Profesional no consulta configuración interna')
  verificar((await pedir(rutaDia, { metodo: 'PUT', token: admin,
    datos: { activo: true, intervalos: [
      { horaInicio: '08:00', horaFin: '12:00' },
      { horaInicio: '11:00', horaFin: '14:00' },
    ] } })).status, 400, 'Se rechaza un traslape')
  const horarioCreado = await pedir(rutaDia, { metodo: 'PUT', token: admin,
    datos: { activo: true, intervalos } })
  verificar(horarioCreado.status, 200, 'Se guarda un día en MongoDB')
  creados.horarios.push(horarioCreado.body.horario.id)
  verificar(horarioCreado.body.horario.intervalos[0].horaInicio, '08:00',
    'Los intervalos quedan ordenados')
  const publico = await pedir('/api/horarios')
  verificar(publico.body.zonaHoraria, 'America/Guatemala', 'Se declara la zona horaria')
  verificar(publico.body.horarios.some((item) => item.dia === diaLibre), true,
    'El día activo se muestra al visitante')
  verificar(publico.body.horarios.every((item) => !('activo' in item)), true,
    'La consulta pública omite el estado interno')
  verificar((await pedir('/api/horarios/administracion', { token: recepcion }))
    .body.horarios.some((item) => item.dia === diaLibre), true,
  'Recepción consulta el día internamente')
  verificar((await pedir(rutaDia, { metodo: 'PUT', token: admin,
    datos: { activo: false, intervalos: [] } })).status, 200,
  'Se cierra el día sin borrarlo')
  verificar((await pedir('/api/horarios')).body.horarios.some((item) => item.dia === diaLibre),
    false, 'El día cerrado no aparece en público')
  verificar((await Horario.findById(creados.horarios[0])).activo, false,
    'El horario permanece en MongoDB')
}

try {
  await ejecutar()
  console.log(`EXITOSA: ${comprobaciones} comprobaciones en sigca_test`)
} catch {
  console.error(`FALLIDA: prueba de fase 4 tras ${comprobaciones} comprobaciones`)
  process.exitCode = 1
} finally {
  if (mongoose.connection.name === 'sigca_test') {
    try {
      await Horario.deleteMany({ _id: { $in: creados.horarios } })
      await Servicio.deleteMany({ _id: { $in: creados.servicios } })
      await Usuario.deleteMany({ _id: { $in: creados.usuarios } })
      console.log('Limpieza de datos ficticios: completada')
    } catch {
      console.error('Limpieza de datos ficticios: FALLIDA; revisar sigca_test')
      process.exitCode = 1
    }
  }
  if (servidor) await new Promise((resolver) => servidor.close(resolver))
  await mongoose.disconnect()
}
