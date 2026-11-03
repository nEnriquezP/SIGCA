import test, { after, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import mongoose from 'mongoose'
import AsignacionMaterial from '../src/models/AsignacionMaterial.js'
import Cita from '../src/models/Cita.js'
import Material from '../src/models/Material.js'
import Paciente from '../src/models/Paciente.js'
import Usuario from '../src/models/Usuario.js'
import { PERMISOS_PREDEFINIDOS, permisosValidos } from '../src/services/permisos.js'

process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.JWT_SECRET = randomBytes(32).toString('hex')
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')

const ids = { admin: 'aaaaaaaaaaaaaaaaaaaaaaaa', profesional: 'bbbbbbbbbbbbbbbbbbbbbbbb',
  recepcion: 'cccccccccccccccccccccccc', material: 'dddddddddddddddddddddddd',
  paciente: 'eeeeeeeeeeeeeeeeeeeeeeee', ajeno: 'ffffffffffffffffffffffff',
  cancelado: '111111111111111111111111', inactivo: '222222222222222222222222' }
const cuentas = new Map()
const materiales = new Map()
const pacientes = new Map()
const citas = []
const asignaciones = []
let servidor
let base

function cuenta(id, rol) {
  const usuario = { id, _id: id, nombre: rol, rol, activo: true, tokenVersion: 0 }
  cuentas.set(id, usuario)
  return crearToken(usuario)
}

function paciente(id, estado = 'ACTIVO') {
  const registro = { id, _id: id, codigo: `PAC-${id.slice(0, 6)}`,
    nombres: 'Paciente', apellidos: id.slice(0, 4), estado,
    observacionesAdministrativas: 'Nunca exponer', fotografia: '/privada' }
  pacientes.set(id, registro)
  return registro
}

function material(id = ids.material, estado = 'ACTIVO') {
  const registro = { id, _id: id, titulo: 'Guía ficticia', descripcion: 'Lectura de prueba',
    tipo: 'Documento', enlace: 'https://example.test/guia', estado }
  materiales.set(id, registro)
  return registro
}

function vincular(idPaciente, estado = 'CONFIRMADA', idProfesional = ids.profesional) {
  citas.push({ paciente: idPaciente, profesional: idProfesional, estado })
}

function coincidePaciente(item, filtro) {
  if (item.estado !== filtro.estado) return false
  if (filtro._id?.$in && !filtro._id.$in.some((id) => String(id) === item.id)) return false
  if (!filtro.$or) return true
  return filtro.$or.some((opcion) => Object.entries(opcion).some(([campo, valor]) =>
    campo === '_id' ? item.id === String(valor) :
      new RegExp(valor.$regex, 'i').test(item[campo])))
}

before(async () => {
  mongoose.startSession = async () => ({
    withTransaction: async (operacion) => operacion(),
    endSession: async () => {},
  })
  Usuario.findById = (id) => ({ select: async () => cuentas.get(String(id)) ?? null })
  Cita.distinct = async (_campo, filtro) => [...new Set(citas.filter((cita) =>
    cita.profesional === String(filtro.profesional) &&
      filtro.estado.$in.includes(cita.estado)).map((cita) => cita.paciente))]
  Cita.exists = async (filtro) => citas.find((cita) =>
    cita.paciente === String(filtro.paciente) &&
      cita.profesional === String(filtro.profesional) &&
      filtro.estado.$in.includes(cita.estado)) ?? null
  Paciente.find = (filtro) => {
    let filas = [...pacientes.values()].filter((item) => coincidePaciente(item, filtro))
    return {
      select() { return this },
      sort() { filas.sort((a, b) => a.apellidos.localeCompare(b.apellidos)); return this },
      skip(cantidad) { filas = filas.slice(cantidad); return this },
      limit(cantidad) { return Promise.resolve(filas.slice(0, cantidad)) },
    }
  }
  Paciente.countDocuments = async (filtro) => [...pacientes.values()]
    .filter((item) => coincidePaciente(item, filtro)).length
  Paciente.findOne = (filtro) => ({ select: async () => {
    const item = pacientes.get(String(filtro._id))
    return item?.estado === filtro.estado ? item : null
  } })
  Paciente.findById = (id) => ({ select: async () => pacientes.get(String(id)) ?? null })
  Paciente.updateOne = async (filtro) => ({ matchedCount:
    pacientes.get(String(filtro._id))?.estado === filtro.estado ? 1 : 0 })
  Material.findById = async (id) => materiales.get(String(id)) ?? null
  Material.updateOne = async (filtro) => ({ matchedCount:
    materiales.get(String(filtro._id))?.estado === filtro.estado ? 1 : 0 })
  AsignacionMaterial.create = async (datos) => {
    const registro = new AsignacionMaterial(Array.isArray(datos) ? datos[0] : datos)
    await registro.validate()
    asignaciones.push(registro)
    return Array.isArray(datos) ? [registro] : registro
  }
  AsignacionMaterial.find = (filtro) => {
    let filas = asignaciones.filter((item) => String(item.paciente) === String(filtro.paciente))
    return {
      sort() { filas = [...filas].sort((a, b) => b.fechaAsignacion - a.fechaAsignacion ||
        b.id.localeCompare(a.id)); return this },
      skip(cantidad) { filas = filas.slice(cantidad); return this },
      limit(cantidad) { filas = filas.slice(0, cantidad); return this },
      populate() { return this },
      then(resolver, rechazar) {
        const pobladas = filas.map((item) => ({ id: item.id,
          fechaAsignacion: item.fechaAsignacion,
          material: materiales.get(String(item.material)) ?? null,
          asignadoPor: cuentas.get(String(item.asignadoPor)) ?? null }))
        return Promise.resolve(pobladas).then(resolver, rechazar)
      },
    }
  }
  servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver, rechazar) => {
    servidor.once('listening', resolver)
    servidor.once('error', rechazar)
  })
  base = `http://127.0.0.1:${servidor.address().port}`
})

beforeEach(() => {
  cuentas.clear(); materiales.clear(); pacientes.clear(); citas.length = 0; asignaciones.length = 0
})
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

test('opciones muestran solo pacientes activos autorizados y cumplen el contrato del selector', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  const profesional = cuenta(ids.profesional, 'PROFESIONAL')
  const recepcion = cuenta(ids.recepcion, 'RECEPCIONISTA')
  paciente(ids.paciente)
  paciente(ids.ajeno)
  paciente(ids.cancelado)
  paciente(ids.inactivo, 'INACTIVO')
  vincular(ids.paciente, 'PENDIENTE')
  vincular(ids.cancelado, 'CANCELADA')
  vincular(ids.inactivo, 'COMPLETADA')
  const opciones = '/api/asignaciones-materiales/opciones?soloPacientes=1&paginaPacientes=0'
  assert.equal((await pedir(opciones)).status, 401)
  assert.equal((await pedir(opciones, { credencial: recepcion })).status, 403)
  const adminLista = await pedir(opciones, { credencial: admin })
  assert.equal(adminLista.status, 200)
  assert.equal(adminLista.body.pacientesTotal, 3)
  const proLista = await pedir(opciones, { credencial: profesional })
  assert.equal(proLista.status, 200)
  assert.deepEqual(proLista.body.pacientes.map((item) => item.id), [ids.paciente])
  assert.deepEqual(Object.keys(proLista.body.pacientes[0]).sort(), ['codigo', 'id', 'nombre'])
  assert.equal(proLista.body.paginaPacientes, 0)
  const ajeno = await pedir(`${opciones}&pacienteSeleccionado=${ids.ajeno}`, { credencial: profesional })
  assert.equal(ajeno.body.pacienteSeleccionado, null)
  const propio = await pedir(`${opciones}&pacienteSeleccionado=${ids.paciente}`, { credencial: profesional })
  assert.equal(propio.body.pacienteSeleccionado.id, ids.paciente)
  assert.equal((await pedir(`${opciones}&buscarPaciente=PAC-eeeeee`,
    { credencial: profesional })).body.pacientesTotal, 1)
  const inactivo = await pedir(`${opciones}&pacienteSeleccionado=${ids.inactivo}`, { credencial: profesional })
  assert.equal(inactivo.body.pacienteSeleccionado, null)
  for (const filtro of ['paginaPacientes=-1', 'pacienteSeleccionado=invalido',
    'soloPacientes=0', `buscarPaciente=${'x'.repeat(81)}`, 'extra=1']) {
    assert.equal((await pedir(`/api/asignaciones-materiales/opciones?${filtro}`,
      { credencial: admin })).status, 400)
  }
})

test('administrador y profesional vinculado asignan; cada repetición conserva un registro propio', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  const profesional = cuenta(ids.profesional, 'PROFESIONAL')
  paciente(ids.paciente)
  material()
  vincular(ids.paciente, 'CONFIRMADA')
  assert.equal(PERMISOS_PREDEFINIDOS.PROFESIONAL.includes('MATERIALES_ASIGNAR'), true)
  assert.equal(PERMISOS_PREDEFINIDOS.RECEPCIONISTA.includes('MATERIALES_ASIGNAR'), false)
  assert.equal(permisosValidos(['MATERIALES_ASIGNAR']), false)
  const datos = { material: ids.material, paciente: ids.paciente }
  const primera = await pedir('/api/asignaciones-materiales', { metodo: 'POST',
    credencial: admin, datos })
  const segunda = await pedir('/api/asignaciones-materiales', { metodo: 'POST',
    credencial: profesional, datos })
  const tercera = await pedir('/api/asignaciones-materiales', { metodo: 'POST',
    credencial: profesional, datos })
  assert.equal(primera.status, 201)
  assert.equal(segunda.status, 201)
  assert.equal(tercera.status, 201)
  assert.notEqual(primera.body.asignacion.id, segunda.body.asignacion.id)
  assert.notEqual(segunda.body.asignacion.id, tercera.body.asignacion.id)
  assert.equal(primera.body.asignacion.asignadoPor, ids.admin)
  assert.equal(segunda.body.asignacion.asignadoPor, ids.profesional)
  assert.ok(Date.parse(tercera.body.asignacion.fechaAsignacion))
  assert.equal(asignaciones.length, 3)
  const listado = await pedir(`/api/asignaciones-materiales?paciente=${ids.paciente}`, { credencial: profesional })
  assert.equal(listado.status, 200)
  assert.equal(listado.body.asignaciones.length, 3)
  assert.equal(listado.body.asignaciones[0].material.titulo, 'Guía ficticia')
  assert.deepEqual(Object.keys(listado.body.paciente).sort(), ['codigo', 'id', 'nombre'])
})

test('rechaza pacientes y materiales inactivos, pacientes ajenos y cita solo cancelada', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  const profesional = cuenta(ids.profesional, 'PROFESIONAL')
  const recepcion = cuenta(ids.recepcion, 'RECEPCIONISTA')
  paciente(ids.paciente)
  paciente(ids.ajeno)
  paciente(ids.cancelado)
  paciente(ids.inactivo, 'INACTIVO')
  material()
  vincular(ids.paciente, 'COMPLETADA')
  vincular(ids.cancelado, 'CANCELADA')
  vincular(ids.inactivo, 'CONFIRMADA')
  const ruta = '/api/asignaciones-materiales'
  const datos = { material: ids.material, paciente: ids.paciente }
  assert.equal((await pedir(ruta, { metodo: 'POST', datos })).status, 401)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: recepcion, datos })).status, 403)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: profesional,
    datos: { ...datos, paciente: ids.ajeno } })).status, 403)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: profesional,
    datos: { ...datos, paciente: ids.cancelado } })).status, 403)
  assert.equal((await pedir(`${ruta}?paciente=${ids.ajeno}`, { credencial: profesional })).status, 403)
  assert.equal((await pedir(`${ruta}?paciente=${ids.cancelado}`, { credencial: profesional })).status, 403)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: admin,
    datos: { ...datos, paciente: ids.inactivo } })).status, 409)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: profesional,
    datos: { ...datos, paciente: ids.inactivo } })).status, 409)
  materiales.get(ids.material).estado = 'INACTIVO'
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: admin, datos })).status, 409)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: profesional, datos })).status, 409)
  assert.equal(asignaciones.length, 0)
})

test('consulta conserva historia después de desactivar paciente y material', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  const profesional = cuenta(ids.profesional, 'PROFESIONAL')
  paciente(ids.paciente)
  material()
  vincular(ids.paciente, 'COMPLETADA')
  const datos = { material: ids.material, paciente: ids.paciente }
  assert.equal((await pedir('/api/asignaciones-materiales', { metodo: 'POST',
    credencial: profesional, datos })).status, 201)
  pacientes.get(ids.paciente).estado = 'INACTIVO'
  materiales.get(ids.material).estado = 'INACTIVO'
  const ruta = `/api/asignaciones-materiales?paciente=${ids.paciente}`
  const historiaAdmin = await pedir(ruta, { credencial: admin })
  const historiaPro = await pedir(ruta, { credencial: profesional })
  assert.equal(historiaAdmin.status, 200)
  assert.equal(historiaPro.status, 200)
  assert.equal(historiaPro.body.asignaciones.length, 1)
  assert.equal(historiaPro.body.asignaciones[0].material.estado, 'INACTIVO')
  assert.equal((await pedir('/api/asignaciones-materiales/opciones',
    { credencial: profesional })).body.pacientesTotal, 0)
  assert.equal(asignaciones.length, 1)
})

test('la consulta de asignaciones pagina de cien en cien', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  paciente(ids.paciente)
  material()
  for (let indice = 0; indice < 101; indice += 1) {
    asignaciones.push(new AsignacionMaterial({ material: ids.material,
      paciente: ids.paciente, asignadoPor: ids.admin }))
  }
  const ruta = `/api/asignaciones-materiales?paciente=${ids.paciente}`
  const primera = await pedir(`${ruta}&pagina=0`, { credencial: admin })
  const segunda = await pedir(`${ruta}&pagina=1`, { credencial: admin })
  assert.equal(primera.status, 200)
  assert.equal(primera.body.asignaciones.length, 100)
  assert.equal(primera.body.hayMas, true)
  assert.equal(segunda.body.asignaciones.length, 1)
  assert.equal(segunda.body.hayMas, false)
})

test('valida cuerpo, filtros y referencias sin permitir falsificar autor', async () => {
  const admin = cuenta(ids.admin, 'ADMINISTRADOR')
  paciente(ids.paciente)
  material()
  const ruta = '/api/asignaciones-materiales'
  const datos = { material: ids.material, paciente: ids.paciente }
  for (const incorrecto of [
    { ...datos, asignadoPor: ids.admin }, { ...datos, fechaAsignacion: '2020-01-01' },
    { ...datos, material: 'invalido' }, { ...datos, paciente: 'invalido' },
    { material: ids.material }, {},
  ]) {
    assert.equal((await pedir(ruta, { metodo: 'POST', credencial: admin,
      datos: incorrecto })).status, 400)
  }
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: admin,
    datos: { ...datos, material: ids.ajeno } })).status, 404)
  assert.equal((await pedir(ruta, { metodo: 'POST', credencial: admin,
    datos: { ...datos, paciente: ids.ajeno } })).status, 404)
  for (const filtro of ['', '?paciente=invalido', `?paciente=${ids.paciente}&pagina=-1`,
    `?paciente=${ids.paciente}&extra=1`]) {
    assert.equal((await pedir(`${ruta}${filtro}`, { credencial: admin })).status, 400)
  }
  assert.equal(asignaciones.length, 0)
})

test('el esquema conserva referencias y no impone unicidad al par material-paciente', async () => {
  assert.equal(AsignacionMaterial.collection.name, 'asignacionesMateriales')
  assert.equal(AsignacionMaterial.schema.path('material').options.ref, 'Material')
  assert.equal(AsignacionMaterial.schema.path('paciente').options.ref, 'Paciente')
  assert.equal(AsignacionMaterial.schema.path('asignadoPor').options.ref, 'Usuario')
  assert.equal(AsignacionMaterial.schema.indexes().some(([, opciones]) => opciones.unique), false)
  const asignacion = new AsignacionMaterial({ material: ids.material,
    paciente: ids.paciente, asignadoPor: ids.admin })
  await asignacion.validate()
  assert.ok(asignacion.fechaAsignacion instanceof Date)
  assert.ok(mongoose.isValidObjectId(asignacion.id))
})
