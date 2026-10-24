import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import Usuario from '../src/models/Usuario.js'
import Servicio from '../src/models/Servicio.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')

const cuentas = new Map()
const servicios = new Map()
const ids = {
  admin: 'aaaaaaaaaaaaaaaaaaaaaaaa', recepcion: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  profesional: 'cccccccccccccccccccccccc', servicio: 'dddddddddddddddddddddddd',
}
let servidor
let base

function cuenta(id, rol) {
  const usuario = { id, rol, activo: true, tokenVersion: 0 }
  cuentas.set(id, usuario)
  return crearToken(usuario)
}

function coincide(item, filtro) {
  if (filtro.estado && item.estado !== filtro.estado) return false
  if (!filtro.$or) return true
  return filtro.$or.some((opcion) => Object.entries(opcion).some(([campo, valor]) =>
    campo === '_id' ? item.id === String(valor) :
      new RegExp(valor.$regex, 'i').test(item[campo])))
}

before(async () => {
  Usuario.findById = (id) => ({ select: async () => cuentas.get(String(id)) ?? null })
  Servicio.find = (filtro) => ({ sort: () => ({ limit: async () =>
    [...servicios.values()].filter((item) => coincide(item, filtro)) }) })
  Servicio.findOne = async (filtro) => [...servicios.values()].find((item) =>
    item.id === String(filtro._id) && item.estado === filtro.estado) ?? null
  Servicio.findById = async (id) => servicios.get(String(id)) ?? null
  Servicio.create = async (datos) => {
    const servicio = { ...datos, id: ids.servicio, estado: 'ACTIVO' }
    servicios.set(servicio.id, servicio)
    return servicio
  }
  Servicio.findByIdAndUpdate = async (id, datos) => {
    const servicio = servicios.get(String(id))
    if (!servicio) return null
    Object.assign(servicio, datos)
    return servicio
  }
  servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver, rechazar) => {
    servidor.once('listening', resolver)
    servidor.once('error', rechazar)
  })
  base = `http://127.0.0.1:${servidor.address().port}`
})

after(() => servidor?.close())

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

test('servicios: validación, importes, permisos y visibilidad pública', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  const recepcion = cuenta(ids.recepcion, 'RECEPCIONISTA')
  const profesional = cuenta(ids.profesional, 'PROFESIONAL')
  const datos = { nombre: 'Atención ficticia', descripcion: 'Servicio de prueba',
    duracionMinutos: 50, precioCentavos: 25025, imagen: '/imagenes/servicio.png' }

  assert.equal((await pedir('/api/servicios')).status, 200)
  assert.equal((await pedir('/api/servicios', { metodo: 'POST', datos })).status, 401)
  assert.equal((await pedir('/api/servicios', { metodo: 'POST', token: recepcion, datos })).status, 403)
  assert.equal((await pedir('/api/servicios', { metodo: 'POST', token: profesional, datos })).status, 403)
  for (const cambio of [
    { duracionMinutos: 0 }, { duracionMinutos: 1.5 }, { precioCentavos: 0 },
    { precioCentavos: 250.5 }, { imagen: 'javascript:alert(1)' },
  ]) {
    assert.equal((await pedir('/api/servicios', { metodo: 'POST', token: admin,
      datos: { ...datos, ...cambio } })).status, 400)
  }
  assert.equal((await pedir('/api/servicios', { metodo: 'POST', token: admin,
    datos: { ...datos, estado: 'INACTIVO' } })).status, 400)

  const creado = await pedir('/api/servicios', { metodo: 'POST', token: admin, datos })
  assert.equal(creado.status, 201)
  assert.equal(creado.body.servicio.precioCentavos, 25025)
  assert.equal((await pedir('/api/servicios')).body.servicios.length, 1)
  assert.equal((await pedir(`/api/servicios/${ids.servicio}`)).status, 200)
  assert.equal((await pedir('/api/servicios/administracion', { token: recepcion })).status, 200)
  assert.equal((await pedir('/api/servicios/administracion', { token: profesional })).status, 403)
  assert.equal((await pedir(`/api/servicios/${ids.servicio}`, { metodo: 'PUT',
    token: recepcion, datos })).status, 403)

  const cambiado = await pedir(`/api/servicios/${ids.servicio}`, { metodo: 'PUT',
    token: admin, datos: { ...datos, precioCentavos: 30000, duracionMinutos: 60 } })
  assert.equal(cambiado.status, 200)
  assert.equal(cambiado.body.servicio.precioCentavos, 30000)
  assert.equal(cambiado.body.servicio.duracionMinutos, 60)
  assert.equal((await pedir(`/api/servicios/${ids.servicio}/estado`, { metodo: 'PATCH',
    token: admin, datos: { estado: 'INACTIVO' } })).status, 200)
  assert.equal((await pedir('/api/servicios')).body.servicios.length, 0)
  assert.equal((await pedir(`/api/servicios/${ids.servicio}`)).status, 404)
  assert.equal((await pedir('/api/servicios?estado=INACTIVO')).status, 400)
  assert.equal((await pedir('/api/servicios/administracion?estado=INACTIVO',
    { token: recepcion })).body.servicios.length, 1)
  assert.equal((await pedir(`/api/servicios/administracion/${ids.servicio}`,
    { token: recepcion })).status, 200)
})
