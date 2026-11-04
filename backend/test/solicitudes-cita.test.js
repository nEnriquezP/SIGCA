import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import Usuario from '../src/models/Usuario.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Servicio from '../src/models/Servicio.js'
import Horario from '../src/models/Horario.js'
import SolicitudCita from '../src/models/SolicitudCita.js'
import Cita from '../src/models/Cita.js'
import CodigoCorreoSolicitud from '../src/models/CodigoCorreoSolicitud.js'
import { ahoraGuatemala, fechaMaximaGuatemala } from '../src/services/prepararCita.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')
const { validarSolicitud } = await import('../src/routes/solicitudesCita.js')
const { codigoSolicitud } = await import('../src/services/codigosSolicitud.js')
const { hashCodigoSolicitudCorreo } = await import('../src/services/verificacionSolicitud.js')

const ids = { admin: 'aaaaaaaaaaaaaaaaaaaaaaaa', recepcion: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  profesional: 'cccccccccccccccccccccccc', paciente: 'dddddddddddddddddddddddd',
  servicio: 'eeeeeeeeeeeeeeeeeeeeeeee', responsable: 'ffffffffffffffffffffffff',
  desafio: '999999999999999999999999' }
const cuentas = new Map()
const solicitudes = new Map()
const citas = new Map()
const desafios = new Map()
const servicio = { id: ids.servicio, estado: 'ACTIVO', duracionMinutos: 60,
  precioCentavos: 25000 }
const paciente = { id: ids.paciente, codigo: 'PAC-000001', estado: 'ACTIVO', fechaNacimiento: '2000-01-01',
  responsables: [], nombres: 'Paciente', apellidos: 'Ficticio' }
let horarioActivo = true
let fallarCreacion = false
let contador = 0
let servidor
let base
const fechaFutura = (() => {
  const fecha = new Date(`${ahoraGuatemala().fecha}T12:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 30)
  return fecha.toISOString().slice(0, 10)
})()

function token(id, rol) {
  const usuario = { id, rol, activo: true, tokenVersion: 0, nombre: rol }
  cuentas.set(id, usuario)
  return crearToken(usuario)
}

function nuevaSolicitud(datos = {}) {
  const id = datos._id ? String(datos._id) : (100 + ++contador).toString(16).padStart(24, '0')
  const item = { id, _id: id, codigo: datos.codigo ?? codigoSolicitud(id),
    nombreSolicitante: 'Persona ficticia',
    correo: 'persona@example.test', telefono: '79223344', servicio: ids.servicio,
    correoVerificado: datos.correoVerificado ?? false,
    recibirPublicaciones: datos.recibirPublicaciones ?? false,
    fechaPreferida: fechaFutura, mensajeAdicional: '', estado: 'PENDIENTE',
    cita: null, createdAt: new Date() }
  solicitudes.set(id, item)
  return item
}

function lista(modelo, filtro) {
  const items = [...modelo.values()].filter((item) =>
    (!filtro.estado || item.estado === filtro.estado) &&
    (!filtro.$or || filtro.$or.some((opcion) => Object.entries(opcion).some(([campo, valor]) =>
      campo === '_id' ? item.id === String(valor) :
        new RegExp(valor.$regex, 'i').test(item[campo])))))
  return { sort: () => ({ limit: async () => items }) }
}

before(async () => {
  Usuario.findById = (id) => ({ select: async () => cuentas.get(String(id)) ?? null })
  Usuario.findOne = async (filtro) => {
    const usuario = cuentas.get(String(filtro._id))
    return usuario?.activo && usuario.rol === filtro.rol ? usuario : null
  }
  Usuario.find = () => ({ select: () => ({ sort: async () =>
    [...cuentas.values()].filter((u) => u.rol === 'PROFESIONAL' && u.activo) }) })
  Paciente.findOne = async (filtro) => paciente.id === String(filtro._id) &&
    paciente.estado === filtro.estado ? paciente : null
  Paciente.find = () => ({ sort: () => ({ skip: () => ({ limit: async () => [paciente] }) }) })
  Paciente.countDocuments = async () => 1
  Servicio.findOne = async (filtro) => servicio.id === String(filtro._id) &&
    servicio.estado === filtro.estado ? servicio : null
  Horario.findOne = async () => horarioActivo ? { intervalos: [
    { horaInicio: '08:00', horaFin: '12:00' }, { horaInicio: '13:00', horaFin: '17:00' },
  ] } : null
  Responsable.findOne = async ({ _id }) => paciente.responsables.some((id) =>
    _id.$in.includes(id) && id === ids.responsable) ? { id: ids.responsable } : null
  SolicitudCita.init = async () => SolicitudCita
  SolicitudCita.exists = async ({ codigo }) =>
    [...solicitudes.values()].some((item) => item.codigo === codigo)
  SolicitudCita.findOne = async ({ codigo }) =>
    [...solicitudes.values()].find((item) => item.codigo === codigo) ?? null
  SolicitudCita.create = async (datos) => Array.isArray(datos) ?
    [nuevaSolicitud(datos[0])] : nuevaSolicitud(datos)
  SolicitudCita.find = (filtro) => lista(solicitudes, filtro)
  SolicitudCita.findById = async (id) => solicitudes.get(String(id)) ?? null
  SolicitudCita.findOneAndUpdate = async (filtro, cambio) => {
    const item = solicitudes.get(String(filtro._id))
    if (!item || item.estado !== filtro.estado) return null
    Object.assign(item, cambio.$set)
    return item
  }
  SolicitudCita.updateOne = async (filtro, cambio) => {
    const item = solicitudes.get(String(filtro._id))
    if (!item || item.estado !== filtro.estado) return { matchedCount: 0 }
    Object.assign(item, cambio.$set)
    return { matchedCount: 1 }
  }
  CodigoCorreoSolicitud.findOneAndUpdate = async (filtro) => {
    const item = desafios.get(String(filtro._id))
    if (!item || item.correo !== filtro.correo || item.usado || item.vence <= new Date() ||
        item.intentos >= 5) return null
    item.intentos += 1
    return item
  }
  CodigoCorreoSolicitud.updateOne = async (filtro) => {
    const item = desafios.get(String(filtro._id))
    if (!item || item.correo !== filtro.correo || item.usado || item.vence <= new Date()) {
      return { matchedCount: 0 }
    }
    item.usado = true
    return { matchedCount: 1 }
  }
  Cita.init = async () => Cita
  Cita.findOne = async (filtro) => [...citas.values()].find((item) =>
    item.profesional === String(filtro.profesional) && item.fecha === filtro.fecha &&
    !filtro.estado.$nin.includes(item.estado) &&
    item.horaInicio < filtro.horaInicio.$lt && item.horaFin > filtro.horaFin.$gt) ?? null
  Cita.create = async ([datos]) => {
    if (fallarCreacion) throw new Error('Fallo simulado de almacenamiento')
    if ([...citas.values()].some((item) => item.solicitudCita === datos.solicitudCita)) {
      const error = new Error('duplicado'); error.code = 11000; throw error
    }
    const id = (500 + citas.size).toString(16).padStart(24, '0')
    const cita = { id, _id: id, ...datos }
    citas.set(id, cita)
    return [cita]
  }
  mongoose.startSession = async () => ({
    async withTransaction(trabajo) {
      const antesSolicitudes = new Map([...solicitudes].map(([id, item]) =>
        [id, structuredClone(item)]))
      const antesCitas = new Map([...citas].map(([id, item]) => [id, structuredClone(item)]))
      const antesDesafios = new Map([...desafios].map(([id, item]) =>
        [id, structuredClone(item)]))
      try { return await trabajo() } catch (error) {
        solicitudes.clear(); for (const [id, item] of antesSolicitudes) solicitudes.set(id, item)
        citas.clear(); for (const [id, item] of antesCitas) citas.set(id, item)
        desafios.clear(); for (const [id, item] of antesDesafios) desafios.set(id, item)
        throw error
      }
    },
    async endSession() {},
  })
  servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver, rechazar) => {
    servidor.once('listening', resolver)
    servidor.once('error', rechazar)
  })
  base = `http://127.0.0.1:${servidor.address().port}`
  desafios.set(ids.desafio, { id: ids.desafio, correo: 'persona@example.test',
    hash: hashCodigoSolicitudCorreo(ids.desafio, 'persona@example.test', '123456'),
    vence: new Date(Date.now() + 600000), intentos: 0, usado: false })
})

after(() => servidor?.close())

async function pedir(ruta, { metodo = 'GET', token: credencial, datos } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}),
      ...(datos !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  })
  return { status: respuesta.status, body: await respuesta.json() }
}

const envio = { nombreSolicitante: 'Persona ficticia', correo: 'persona@example.test',
  telefono: '79223344', servicio: ids.servicio,
  fechaPreferida: fechaFutura, mensajeAdicional: '',
  verificacionId: ids.desafio, codigoVerificacion: '123456', recibirPublicaciones: false }
const conversion = { paciente: ids.paciente, profesional: ids.profesional,
  fecha: fechaFutura, horaInicio: '10:00' }

test('solicitud pública valida servicio y contacto sin crear ni reservar cita', async () => {
  token(ids.profesional, 'PROFESIONAL')
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, correo: 'invalido' } })).status, 400)
  for (const correo of ['persona@dominio', 'persona@-dominio.com',
    'persona..dos@dominio.com']) {
    assert.ok(validarSolicitud({ ...envio, correo }), correo)
  }
  for (const telefono of ['09223344', '7922334', '792233449', '+50279223344',
    '7922-3344', '7922abcd']) {
    assert.ok(validarSolicitud({ ...envio, telefono }), telefono)
  }
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, telefono: '09223344' } })).status, 400)
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, fechaPreferida: '2020-01-01' } })).status, 400)
  const dia366 = new Date(`${fechaMaximaGuatemala()}T12:00:00Z`)
  dia366.setUTCDate(dia366.getUTCDate() + 1)
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, fechaPreferida: dia366.toISOString().slice(0, 10) } })).status, 400)
  servicio.estado = 'INACTIVO'
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST', datos: envio })).status, 409)
  servicio.estado = 'ACTIVO'
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, codigoVerificacion: '000000' } })).status, 400)
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, verificacionId: '' } })).status, 400)
  const creado = await pedir('/api/solicitudes-cita', { metodo: 'POST', datos: envio })
  assert.equal(creado.status, 201)
  assert.equal(creado.body.solicitud.estado, 'PENDIENTE')
  assert.match(creado.body.solicitud.codigo, /^CONS-CITA-[0-9A-F]{5}$/)
  assert.equal(desafios.get(ids.desafio).usado, true)
  assert.equal(solicitudes.get(creado.body.solicitud.id).correoVerificado, true)
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST', datos: envio })).status, 400)
  assert.equal('correo' in creado.body, false)
  assert.equal(citas.size, 0)
  assert.equal(solicitudes.get(creado.body.solicitud.id).cita, null)
  assert.equal((await pedir('/api/solicitudes-cita')).status, 401)
})

test('consulta y rechazo protegidos conservan solicitud', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const recepcion = token(ids.recepcion, 'RECEPCIONISTA')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  assert.equal((await pedir('/api/solicitudes-cita', { token: profesional })).status, 403)
  assert.equal((await pedir('/api/solicitudes-cita', { token: recepcion })).status, 200)
  const opciones = await pedir('/api/solicitudes-cita/opciones', { token: recepcion })
  assert.equal(opciones.status, 200)
  assert.equal(opciones.body.pacientes[0].codigo, 'PAC-000001')
  assert.equal(opciones.body.pacientes[0].id, ids.paciente)
  const item = nuevaSolicitud()
  assert.equal((await pedir(`/api/solicitudes-cita/${item.id}`, { token: admin })).status, 200)
  assert.equal((await pedir(`/api/solicitudes-cita/${item.id}/rechazar`,
    { metodo: 'PATCH', token: profesional, datos: {} })).status, 403)
  assert.equal((await pedir(`/api/solicitudes-cita/${item.id}/rechazar`,
    { metodo: 'PATCH', token: recepcion, datos: {} })).status, 200)
  assert.equal(solicitudes.get(item.id).estado, 'RECHAZADA')
  assert.equal((await pedir(`/api/solicitudes-cita/${item.id}/rechazar`,
    { metodo: 'PATCH', token: admin, datos: {} })).status, 409)
  assert.equal((await pedir(`/api/solicitudes-cita/${item.id}/convertir`,
    { metodo: 'POST', token: admin, datos: conversion })).status, 409)
})

test('conversión crea cita real mínima con valores históricos y evita duplicado', async () => {
  const recepcion = token(ids.recepcion, 'RECEPCIONISTA')
  const item = nuevaSolicitud()
  const convertido = await pedir(`/api/solicitudes-cita/${item.id}/convertir`,
    { metodo: 'POST', token: recepcion, datos: conversion })
  assert.equal(convertido.status, 201)
  assert.equal(solicitudes.get(item.id).estado, 'ATENDIDA')
  assert.equal(solicitudes.get(item.id).cita, convertido.body.solicitud.cita)
  const cita = citas.get(convertido.body.solicitud.cita)
  assert.equal(cita.paciente, ids.paciente)
  assert.equal(cita.servicio, ids.servicio)
  assert.equal(cita.profesional, ids.profesional)
  assert.equal(cita.horaInicio, '10:00')
  assert.equal(cita.horaFin, '11:00')
  assert.equal(cita.minutosOcupados.length, 60)
  assert.equal(cita.duracionMinutos, 60)
  assert.equal(cita.precioCentavos, 25000)
  assert.equal(cita.estado, 'PENDIENTE')
  servicio.precioCentavos = 30000
  assert.equal(cita.precioCentavos, 25000)
  assert.equal((await pedir(`/api/solicitudes-cita/${item.id}/convertir`,
    { metodo: 'POST', token: recepcion, datos: conversion })).status, 409)
  assert.equal(citas.size, 1)
})

test('reglas de conversión y reversión ante fallo conservan pendiente sin cita huérfana', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const ruta = (item) => `/api/solicitudes-cita/${item.id}/convertir`
  const invalida = async (cambio) => {
    const item = nuevaSolicitud()
    const resultado = await pedir(ruta(item), { metodo: 'POST', token: admin,
      datos: { ...conversion, ...cambio } })
    assert.notEqual(resultado.status, 201)
    assert.equal(solicitudes.get(item.id).estado, 'PENDIENTE')
    assert.equal(solicitudes.get(item.id).cita, null)
  }
  await invalida({ fecha: '2020-01-01' })
  await invalida({ fecha: '3010-01-01' })
  await invalida({ horaInicio: '12:30' })
  paciente.estado = 'INACTIVO'; await invalida({ horaInicio: '14:00' }); paciente.estado = 'ACTIVO'
  servicio.estado = 'INACTIVO'; await invalida({ horaInicio: '14:00' }); servicio.estado = 'ACTIVO'
  cuentas.get(ids.profesional).activo = false
  await invalida({ horaInicio: '14:00' })
  cuentas.get(ids.profesional).activo = true
  paciente.fechaNacimiento = '2090-01-01'
  await invalida({ horaInicio: '14:00' })
  paciente.responsables = [ids.responsable]
  const menor = nuevaSolicitud()
  assert.equal((await pedir(ruta(menor), { metodo: 'POST', token: admin,
    datos: { ...conversion, horaInicio: '14:00' } })).status, 201)
  paciente.fechaNacimiento = '2000-01-01'; paciente.responsables = []
  await invalida({ horaInicio: '10:30' })
  horarioActivo = false; await invalida({ horaInicio: '15:00' }); horarioActivo = true
  fallarCreacion = true
  const fallida = nuevaSolicitud()
  assert.equal((await pedir(ruta(fallida), { metodo: 'POST', token: admin,
    datos: { ...conversion, horaInicio: '15:00' } })).status, 500)
  fallarCreacion = false
  assert.equal(solicitudes.get(fallida.id).estado, 'PENDIENTE')
  assert.equal(solicitudes.get(fallida.id).cita, null)
  assert.equal([...citas.values()].some((c) => c.solicitudCita === fallida.id), false)
})
