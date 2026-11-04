import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import Material, { enlaceMaterialValido } from '../src/models/Material.js'
import Contador from '../src/models/Contador.js'
import Usuario from '../src/models/Usuario.js'
import Rol from '../src/models/Rol.js'
import { permisosValidos, PERMISOS_PREDEFINIDOS } from '../src/services/permisos.js'

process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')

const cuentas = new Map()
const materiales = new Map()
const ids = { admin: 'aaaaaaaaaaaaaaaaaaaaaaaa', profesional: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  recepcion: 'cccccccccccccccccccccccc', personalizado: 'dddddddddddddddddddddddd' }
const datosBase = { titulo: 'Guía de hábitos', descripcion: 'Lectura para familias',
  tipo: 'Documento', enlace: 'https://example.test/guia' }
let servidor
let base
let secuencia = 0

function token(id, rol) {
  const usuario = { id, rol, activo: true, tokenVersion: 0 }
  cuentas.set(id, usuario)
  return crearToken(usuario)
}

function coincide(material, filtro) {
  if (filtro.estado && material.estado !== filtro.estado) return false
  if (filtro.tipo && !new RegExp(filtro.tipo.$regex, 'i').test(material.tipo)) return false
  if (!filtro.$or) return true
  return filtro.$or.some((opcion) => Object.entries(opcion).some(([campo, valor]) =>
    campo === '_id' ? material.id === String(valor) :
      new RegExp(valor.$regex, 'i').test(material[campo])))
}

before(async () => {
  Usuario.findById = (id) => ({ select: async () => cuentas.get(String(id)) ?? null })
  Rol.findOne = () => ({ lean: async () => ({ permisos: ['MATERIALES_VER', 'MATERIALES_GESTIONAR'] }) })
  Material.find = (filtro) => {
    let filas = [...materiales.values()].filter((item) => coincide(item, filtro))
    return {
      sort() { filas.sort((a, b) => b.fechaRegistro - a.fechaRegistro ||
        b.id.localeCompare(a.id)); return this },
      skip(cantidad) { filas = filas.slice(cantidad); return this },
      limit(cantidad) { return Promise.resolve(filas.slice(0, cantidad)) },
    }
  }
  Material.findOne = async (filtro) => {
    const material = materiales.get(String(filtro._id))
    return material && (!filtro.estado || material.estado === filtro.estado) ? material : null
  }
  Material.exists = async (filtro) =>
    filtro.codigo === null && [...materiales.values()].some((material) => !material.codigo)
  Contador.findOneAndUpdate = async () => ({ secuencia: ++secuencia })
  Material.create = async (datos) => {
    const material = new Material(datos)
    await material.validate()
    material.fechaRegistro = new Date()
    material.fechaActualizacion = material.fechaRegistro
    materiales.set(material.id, material)
    return material
  }
  Material.findByIdAndUpdate = async (id, cambio) => {
    const material = materiales.get(String(id))
    if (!material) return null
    material.set(cambio.$set)
    await material.validate()
    material.fechaActualizacion = new Date()
    return material
  }
  servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver, rechazar) => {
    servidor.once('listening', resolver)
    servidor.once('error', rechazar)
  })
  base = `http://127.0.0.1:${servidor.address().port}`
})

beforeEach(() => { cuentas.clear(); materiales.clear(); secuencia = 0 })
after(() => servidor?.close())

async function pedir(ruta, { metodo = 'GET', credencial, datos } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}),
      ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  })
  return { status: respuesta.status, body: await respuesta.json() }
}

test('el catálogo exige sesión y reserva la gestión al administrador', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  const recepcion = token(ids.recepcion, 'RECEPCIONISTA')
  const personalizado = token(ids.personalizado, 'ROL_PRUEBA')
  assert.equal(PERMISOS_PREDEFINIDOS.PROFESIONAL.includes('MATERIALES_VER'), true)
  assert.equal(PERMISOS_PREDEFINIDOS.PROFESIONAL.includes('MATERIALES_GESTIONAR'), false)
  assert.equal(permisosValidos(['MATERIALES_VER']), false)
  assert.equal((await pedir('/api/materiales')).status, 401)
  assert.equal((await pedir('/api/materiales', { credencial: recepcion })).status, 403)
  assert.equal((await pedir('/api/materiales', { credencial: personalizado })).status, 403)
  assert.equal((await pedir('/api/materiales', { credencial: profesional })).status, 200)
  assert.equal((await pedir('/api/materiales', { credencial: admin })).status, 200)
  for (const credencial of [profesional, recepcion, personalizado]) {
    assert.equal((await pedir('/api/materiales', { metodo: 'POST', credencial,
      datos: datosBase })).status, 403)
  }
})

test('alta, edición, desactivación y reactivación conservan el registro', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  const alta = await pedir('/api/materiales', { metodo: 'POST', credencial: admin,
    datos: { ...datosBase, titulo: '  Guía de hábitos  ' } })
  assert.equal(alta.status, 201)
  const id = alta.body.material.id
  assert.match(id, /^[a-f\d]{24}$/i)
  assert.equal(alta.body.material.codigo, 'MAT-0001')
  assert.equal(alta.body.material.titulo, 'Guía de hábitos')
  assert.equal(alta.body.material.estado, 'ACTIVO')
  assert.ok(Date.parse(alta.body.material.fechaRegistro))
  assert.ok(Date.parse(alta.body.material.fechaActualizacion))
  assert.equal((await pedir(`/api/materiales/${id}`, { credencial: profesional })).status, 200)

  const edicion = await pedir(`/api/materiales/${id}`, { metodo: 'PUT', credencial: admin,
    datos: { ...datosBase, titulo: 'Nueva guía', tipo: 'Video', enlace: '/materiales/video' } })
  assert.equal(edicion.status, 200)
  assert.equal(edicion.body.material.titulo, 'Nueva guía')
  assert.equal(edicion.body.material.codigo, 'MAT-0001')
  assert.equal(edicion.body.material.estado, 'ACTIVO')
  assert.equal(edicion.body.material.fechaRegistro, alta.body.material.fechaRegistro)
  assert.equal((await pedir(`/api/materiales/${id}`, { metodo: 'PUT', credencial: profesional,
    datos: datosBase })).status, 403)

  const baja = await pedir(`/api/materiales/${id}/estado`, { metodo: 'PATCH', credencial: admin,
    datos: { estado: 'INACTIVO' } })
  assert.equal(baja.status, 200)
  assert.equal((await pedir('/api/materiales', { credencial: profesional })).body.materiales.length, 0)
  assert.equal((await pedir(`/api/materiales/${id}`, { credencial: profesional })).status, 404)
  assert.equal((await pedir('/api/materiales?estado=INACTIVO', { credencial: profesional })).status, 403)
  assert.equal((await pedir('/api/materiales?estado=INACTIVO', { credencial: admin })).body.materiales.length, 1)
  assert.equal((await pedir(`/api/materiales/${id}`, { credencial: admin })).body.material.estado, 'INACTIVO')
  assert.equal(materiales.size, 1)
  assert.equal((await pedir(`/api/materiales/${id}`, { metodo: 'DELETE', credencial: admin })).status, 404)

  assert.equal((await pedir(`/api/materiales/${id}/estado`, { metodo: 'PATCH', credencial: profesional,
    datos: { estado: 'ACTIVO' } })).status, 403)
  assert.equal((await pedir(`/api/materiales/${id}/estado`, { metodo: 'PATCH', credencial: admin,
    datos: { estado: 'ACTIVO' } })).status, 200)
  assert.equal((await pedir(`/api/materiales/${id}`, { credencial: profesional })).status, 200)
})

test('valida datos, URL, identificadores y filtros sin alterar el catálogo', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  for (const cambio of [
    { titulo: ' ' }, { descripcion: '' }, { tipo: ' ' },
    { enlace: 'javascript:alert(1)' }, { enlace: '//ejemplo.test/recurso' },
    { enlace: 'https://usuario:clave@ejemplo.test/recurso' },
    { enlace: `https://ejemplo.test/${'x'.repeat(500)}` },
    { titulo: 'x'.repeat(161) }, { descripcion: 'x'.repeat(4001) },
    { tipo: 'x'.repeat(81) },
  ]) {
    assert.equal((await pedir('/api/materiales', { metodo: 'POST', credencial: admin,
      datos: { ...datosBase, ...cambio } })).status, 400)
  }
  for (const extra of [{ estado: 'INACTIVO' }, { codigo: 'MAT-9999' },
    { fechaRegistro: '2020-01-01' },
    { id: ids.admin }, { desconocido: true }]) {
    assert.equal((await pedir('/api/materiales', { metodo: 'POST', credencial: admin,
      datos: { ...datosBase, ...extra } })).status, 400)
  }
  assert.equal(materiales.size, 0)

  const creado = await pedir('/api/materiales', { metodo: 'POST', credencial: admin, datos: datosBase })
  const id = creado.body.material.id
  assert.equal((await pedir(`/api/materiales/${id}`, { metodo: 'PUT', credencial: admin,
    datos: { ...datosBase, estado: 'INACTIVO' } })).status, 400)
  for (const datos of [{ estado: 'BORRADO' }, { estado: 'ACTIVO', extra: true }, {}]) {
    assert.equal((await pedir(`/api/materiales/${id}/estado`, { metodo: 'PATCH', credencial: admin,
      datos })).status, 400)
  }
  for (const ruta of ['/api/materiales/invalido', '/api/materiales/ffffffffffffffffffffffff']) {
    assert.equal((await pedir(ruta, { credencial: admin })).status,
      ruta.endsWith('invalido') ? 400 : 404)
  }
  assert.equal((await pedir('/api/materiales/invalido', { metodo: 'PUT', credencial: admin,
    datos: datosBase })).status, 400)
  assert.equal((await pedir('/api/materiales/invalido/estado', { metodo: 'PATCH', credencial: admin,
    datos: { estado: 'ACTIVO' } })).status, 400)
  for (const filtro of ['estado=OTRO', 'pagina=-1', 'pagina=10000', 'tipo=', 'extra=1']) {
    assert.equal((await pedir(`/api/materiales?${filtro}`, { credencial: admin })).status, 400)
  }
  assert.equal((await pedir('/api/materiales?estado=INACTIVO', { credencial: profesional })).status, 403)
  assert.equal(materiales.size, 1)
})

test('filtra por texto, tipo y estado con paginación de cien registros', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const profesional = token(ids.profesional, 'PROFESIONAL')
  for (let indice = 0; indice < 101; indice += 1) {
    await pedir('/api/materiales', { metodo: 'POST', credencial: admin,
      datos: { ...datosBase, titulo: `Guía ${indice}`, tipo: indice === 100 ? 'Vídeo' : 'Documento' } })
  }
  const primera = await pedir('/api/materiales?pagina=0', { credencial: admin })
  const segunda = await pedir('/api/materiales?pagina=1', { credencial: admin })
  assert.equal(primera.body.materiales.length, 100)
  assert.equal(primera.body.hayMas, true)
  assert.equal(segunda.body.materiales.length, 1)
  assert.equal(segunda.body.hayMas, false)
  const codigoBuscado = primera.body.materiales[0].codigo
  assert.match(codigoBuscado, /^MAT-\d{4,}$/)
  const busquedaCodigo = await pedir(`/api/materiales?buscar=${codigoBuscado}`,
    { credencial: profesional })
  assert.equal(busquedaCodigo.body.materiales.length, 1)
  assert.equal(busquedaCodigo.body.materiales[0].codigo, codigoBuscado)
  assert.equal((await pedir('/api/materiales?tipo=v%C3%ADdeo', { credencial: admin })).body.materiales.length, 1)
  assert.equal((await pedir('/api/materiales?buscar=Gu%C3%ADa%20100',
    { credencial: profesional })).body.materiales.length, 1)
  assert.equal((await pedir('/api/materiales?buscar=%5B', { credencial: admin })).body.materiales.length, 0)
  const id = segunda.body.materiales[0].id
  await pedir(`/api/materiales/${id}/estado`, { metodo: 'PATCH', credencial: admin,
    datos: { estado: 'INACTIVO' } })
  assert.equal((await pedir('/api/materiales?estado=ACTIVO', { credencial: admin })).body.materiales.length, 100)
  assert.equal((await pedir('/api/materiales?estado=INACTIVO', { credencial: admin })).body.materiales.length, 1)
  assert.equal((await pedir('/api/materiales', { credencial: profesional })).body.materiales.length, 100)
})

test('evita altas hasta asignar código a materiales existentes', async () => {
  const admin = token(ids.admin, 'ADMINISTRADOR')
  const anterior = new Material(datosBase)
  materiales.set(anterior.id, anterior)
  const respuesta = await pedir('/api/materiales', { metodo: 'POST', credencial: admin,
    datos: datosBase })
  assert.equal(respuesta.status, 503)
  assert.equal(materiales.size, 1)
})

test('el esquema guarda campos y fechas previstos y rechaza enlaces inseguros', async () => {
  assert.equal(Material.collection.name, 'materiales')
  assert.ok(Material.schema.path('fechaRegistro'))
  assert.ok(Material.schema.path('fechaActualizacion'))
  assert.equal(enlaceMaterialValido('https://example.test/recurso'), true)
  assert.equal(enlaceMaterialValido('/materiales/recurso'), true)
  for (const enlace of ['javascript:alert(1)', 'data:text/html,abc', '//example.test',
    'https://usuario:clave@example.test/recurso', 'https://example.test/archivo\\ruta']) {
    assert.equal(enlaceMaterialValido(enlace), false)
  }
  assert.equal((new Material(datosBase)).estado, 'ACTIVO')
  await assert.rejects((new Material({ ...datosBase, tipo: ' ' })).validate())
})
