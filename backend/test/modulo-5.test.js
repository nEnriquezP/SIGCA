import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import Usuario from '../src/models/Usuario.js'
import ContenidoInstitucional from '../src/models/ContenidoInstitucional.js'
import Publicacion from '../src/models/Publicacion.js'
import Actividad from '../src/models/Actividad.js'
import MensajeContacto from '../src/models/MensajeContacto.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')

const cuentas = new Map()
const publicaciones = new Map()
const actividades = new Map()
const mensajes = []
const ids = { admin: 'aaaaaaaaaaaaaaaaaaaaaaaa', recepcion: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  profesional: 'cccccccccccccccccccccccc', publicacion: 'dddddddddddddddddddddddd',
  actividad: 'eeeeeeeeeeeeeeeeeeeeeeee' }
let contenido = null
let servidor
let base

function token(id, rol) {
  const usuario = { id, rol, activo: true, tokenVersion: 0 }
  cuentas.set(id, usuario)
  return crearToken(usuario)
}

function consulta(items, filtro) {
  return { sort: () => ({ limit: async () => [...items.values()].filter((item) =>
    !filtro?.activo || item.activo === filtro.activo) }) }
}

before(async () => {
  Usuario.findById = (id) => ({ select: async () => cuentas.get(String(id)) ?? null })
  ContenidoInstitucional.findOne = async () => contenido
  ContenidoInstitucional.findOneAndUpdate = async (filtro, cambio) => {
    contenido = { ...cambio.$set }
    return contenido
  }
  Publicacion.find = (filtro) => consulta(publicaciones, filtro)
  Publicacion.create = async (datos) => {
    const item = { id: ids.publicacion, activo: true, ...datos }
    publicaciones.set(item.id, item)
    return item
  }
  Publicacion.findById = async (id) => {
    const item = publicaciones.get(String(id))
    return item ? { ...item } : null
  }
  Publicacion.findByIdAndUpdate = async (id, cambio) => {
    const item = publicaciones.get(String(id))
    if (!item) return null
    Object.assign(item, cambio)
    return item
  }
  Actividad.find = (filtro) => consulta(actividades, filtro)
  Actividad.create = async (datos) => {
    const item = { id: ids.actividad, activo: true, ...datos }
    actividades.set(item.id, item)
    return item
  }
  Actividad.findByIdAndUpdate = async (id, cambio) => {
    const item = actividades.get(String(id))
    if (!item) return null
    Object.assign(item, cambio)
    return item
  }
  MensajeContacto.create = async (datos) => { mensajes.push({ id: 'ffffffffffffffffffffffff',
    createdAt: new Date(), ...datos }); return mensajes.at(-1) }
  MensajeContacto.find = () => ({ sort: () => ({ limit: async () => [...mensajes] }) })
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

test('contenido: estado vacío, validación, permisos y carrusel real', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const recepcion = token(ids.recepcion, 'RECEPCIONISTA')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  assert.deepEqual((await pedir('/api/contenido')).body, { contenido: null })
  const datos = { nombreCentro: 'Centro ficticio', logo: '/logo.png',
    informacionPrincipal: 'Presentación', mision: 'Misión', vision: 'Visión',
    carrusel: ['/1.png', '/2.png', '/3.png', '/4.png', '/5.png'],
    contacto: { correo: 'info@example.test', telefono: '+502 1234 5678',
      direccion: 'Dirección ficticia' } }
  for (const credencial of [undefined, recepcion, profesional]) {
    assert.equal((await pedir('/api/contenido', { metodo: 'PUT', token: credencial,
      datos })).status, credencial ? 403 : 401)
  }
  for (const cambio of [
    { carrusel: ['/1.png'] }, { logo: 'javascript:alert(1)' },
    { contacto: { ...datos.contacto, correo: 'invalido' } },
    { carrusel: ['/1.png', '/2.png', '/3.png', '/4.png', 'data:image/png,abc'] },
  ]) {
    assert.equal((await pedir('/api/contenido', { metodo: 'PUT', token: admin,
      datos: { ...datos, ...cambio } })).status, 400)
  }
  assert.equal((await pedir('/api/contenido', { metodo: 'PUT', token: admin,
    datos: { ...datos, clave: 'otra' } })).status, 400)
  assert.equal((await pedir('/api/contenido', { metodo: 'PUT', token: admin, datos })).status, 200)
  assert.equal((await pedir('/api/contenido')).body.contenido.carrusel.length, 5)
})

test('publicaciones y actividades: fechas, imágenes, permisos y visibilidad', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const recepcion = token(ids.recepcion, 'RECEPCIONISTA')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  const pub = { titulo: 'Publicación ficticia', descripcion: 'Descripción',
    fechaPublicacion: '2026-10-23', imagen: '', enlace: '/recurso' }
  assert.equal((await pedir('/api/publicaciones/administracion')).status, 401)
  assert.equal((await pedir('/api/publicaciones/administracion', { token: recepcion })).status, 403)
  assert.equal((await pedir('/api/publicaciones', { metodo: 'POST', token: profesional,
    datos: pub })).status, 403)
  assert.equal((await pedir('/api/publicaciones', { metodo: 'POST', token: admin,
    datos: { ...pub, fechaPublicacion: '2026-02-30' } })).status, 400)
  assert.equal((await pedir('/api/publicaciones', { metodo: 'POST', token: admin,
    datos: { ...pub, enlace: 'javascript:alert(1)' } })).status, 400)
  assert.equal((await pedir('/api/publicaciones', { metodo: 'POST', token: admin, datos: pub })).status, 201)
  assert.equal((await pedir('/api/publicaciones')).body.publicaciones.length, 1)
  assert.equal((await pedir(`/api/publicaciones/${ids.publicacion}`, { metodo: 'PUT',
    token: recepcion, datos: pub })).status, 403)
  assert.equal((await pedir(`/api/publicaciones/${ids.publicacion}`, { metodo: 'PUT',
    token: admin, datos: { ...pub, titulo: 'Actualizada' } })).status, 200)
  assert.equal((await pedir(`/api/publicaciones/${ids.publicacion}/estado`, { metodo: 'PATCH',
    token: admin, datos: { activo: false } })).status, 200)
  assert.equal((await pedir('/api/publicaciones')).body.publicaciones.length, 0)
  assert.equal((await pedir('/api/publicaciones/administracion',
    { token: admin })).body.publicaciones.length, 1)

  const act = { tipo: 'ESCUELA_PADRES', titulo: 'Actividad ficticia',
    descripcion: 'Descripción', imagenes: ['/actividad.png'] }
  assert.equal((await pedir('/api/actividades', { metodo: 'POST', token: recepcion,
    datos: act })).status, 403)
  assert.equal((await pedir('/api/actividades', { metodo: 'POST', token: admin,
    datos: { ...act, tipo: 'NO_EXISTE' } })).status, 400)
  assert.equal((await pedir('/api/actividades', { metodo: 'POST', token: admin,
    datos: { ...act, imagenes: ['data:image/png,abc'] } })).status, 400)
  assert.equal((await pedir('/api/actividades', { metodo: 'POST', token: admin,
    datos: act })).status, 201)
  assert.equal((await pedir('/api/actividades')).body.actividades.length, 1)
  assert.equal((await pedir(`/api/actividades/${ids.actividad}`, { metodo: 'PUT',
    token: admin, datos: { ...act, titulo: 'Modificada' } })).status, 200)
  assert.equal((await pedir(`/api/actividades/${ids.actividad}/estado`, { metodo: 'PATCH',
    token: profesional, datos: { activo: false } })).status, 403)
  assert.equal((await pedir(`/api/actividades/${ids.actividad}/estado`, { metodo: 'PATCH',
    token: admin, datos: { activo: false } })).status, 200)
  assert.equal((await pedir('/api/actividades')).body.actividades.length, 0)
  assert.equal((await pedir('/api/actividades/administracion',
    { token: admin })).body.actividades.length, 1)
})

test('contacto: validación, persistencia simulada y lectura solo administrativa', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const recepcion = token(ids.recepcion, 'RECEPCIONISTA')
  const datos = { nombre: 'Visitante ficticio', correo: 'visitante@example.test',
    telefono: '+502 1234 5678', asunto: 'Consulta', mensaje: 'Texto de prueba' }
  assert.equal((await pedir('/api/mensajes-contacto')).status, 401)
  assert.equal((await pedir('/api/mensajes-contacto', { token: recepcion })).status, 403)
  assert.equal((await pedir('/api/mensajes-contacto', { metodo: 'POST',
    datos: { ...datos, correo: 'incorrecto' } })).status, 400)
  assert.equal((await pedir('/api/mensajes-contacto', { metodo: 'POST',
    datos: { ...datos, privilegio: true } })).status, 400)
  const enviado = await pedir('/api/mensajes-contacto', { metodo: 'POST', datos })
  assert.equal(enviado.status, 201)
  assert.deepEqual(enviado.body, { mensaje: 'Mensaje recibido' })
  assert.equal((await pedir('/api/mensajes-contacto', { token: admin })).body.mensajes.length, 1)
  assert.equal((await pedir('/api/mensajes-contacto', { token: admin })).body.mensajes[0].correo,
    'visitante@example.test')
})
