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

process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')

const ids = { admin: 'aaaaaaaaaaaaaaaaaaaaaaaa', recepcion: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  profesional: 'cccccccccccccccccccccccc', paciente: 'dddddddddddddddddddddddd',
  servicio: 'eeeeeeeeeeeeeeeeeeeeeeee', responsable: 'ffffffffffffffffffffffff' }
const cuentas = new Map()
const solicitudes = new Map()
const citas = new Map()
const servicio = { id: ids.servicio, estado: 'ACTIVO', duracionMinutos: 60,
  precioCentavos: 25000 }
const paciente = { id: ids.paciente, codigo: 'PAC-000001', estado: 'ACTIVO', fechaNacimiento: '2000-01-01',
  responsables: [], nombres: 'Paciente', apellidos: 'Ficticio' }
let horarioActivo = true
let fallarCreacion = false
let contador = 0
let servidor
let base

function token(id, rol) {
  const usuario = { id, rol, activo: true, tokenVersion: 0, nombre: rol }
  cuentas.set(id, usuario)
  return crearToken(usuario)
}

function nuevaSolicitud() {
  const id = (100 + ++contador).toString(16).padStart(24, '0')
  const item = { id, _id: id, nombreSolicitante: 'Persona ficticia',
    correo: 'persona@example.test', telefono: '+502 1234 5678', servicio: ids.servicio,
    fechaPreferida: '2099-12-01', mensajeAdicional: '', estado: 'PENDIENTE',
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
  Usuario.find = () => ({ select: () => ({ sort: () => ({ limit: async () =>
    [...cuentas.values()].filter((u) => u.rol === 'PROFESIONAL' && u.activo) }) }) })
  Paciente.findOne = async (filtro) => paciente.id === String(filtro._id) &&
    paciente.estado === filtro.estado ? paciente : null
  Paciente.find = () => ({ sort: () => ({ limit: async () => [paciente] }) })
  Servicio.findOne = async (filtro) => servicio.id === String(filtro._id) &&
    servicio.estado === filtro.estado ? servicio : null
  Horario.findOne = async () => horarioActivo ? { intervalos: [
    { horaInicio: '08:00', horaFin: '12:00' }, { horaInicio: '13:00', horaFin: '17:00' },
  ] } : null
  Responsable.findOne = async ({ _id }) => paciente.responsables.some((id) =>
    _id.$in.includes(id) && id === ids.responsable) ? { id: ids.responsable } : null
  SolicitudCita.create = async () => nuevaSolicitud()
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
      try { return await trabajo() } catch (error) {
        solicitudes.clear(); for (const [id, item] of antesSolicitudes) solicitudes.set(id, item)
        citas.clear(); for (const [id, item] of antesCitas) citas.set(id, item)
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
  telefono: '+502 1234 5678', servicio: ids.servicio,
  fechaPreferida: '2099-12-01', mensajeAdicional: '' }
const conversion = { paciente: ids.paciente, profesional: ids.profesional,
  fecha: '2099-12-01', horaInicio: '10:00' }

test('solicitud pública valida servicio y contacto sin crear ni reservar cita', async () => {
  token(ids.profesional, 'PROFESIONAL')
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, correo: 'invalido' } })).status, 400)
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST',
    datos: { ...envio, fechaPreferida: '2020-01-01' } })).status, 400)
  servicio.estado = 'INACTIVO'
  assert.equal((await pedir('/api/solicitudes-cita', { metodo: 'POST', datos: envio })).status, 409)
  servicio.estado = 'ACTIVO'
  const creado = await pedir('/api/solicitudes-cita', { metodo: 'POST', datos: envio })
  assert.equal(creado.status, 201)
  assert.equal(creado.body.solicitud.estado, 'PENDIENTE')
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
