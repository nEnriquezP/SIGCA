import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import Usuario from '../src/models/Usuario.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Contador from '../src/models/Contador.js'
import ImagenCargada from '../src/models/ImagenCargada.js'
import Rol from '../src/models/Rol.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')
process.env.CORS_ORIGIN = 'http://localhost:5173'

const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')
const usuarios = new Map()
const pacientes = new Map()
const responsables = new Map()
const secuencias = new Map()
const rolesPersonalizados = new Map()
let servidor
let base

function consulta(valor) {
  return {
    select: async () => valor,
    then: (resolver, rechazar) => Promise.resolve(valor).then(resolver, rechazar),
  }
}

function agregarUsuario(id, rol, activo = true) {
  const usuario = {
    id, nombre: rol, correo: `${rol.toLowerCase()}@example.test`, rol, activo,
    passwordHash: hashInicial, tokenVersion: 0,
    async save() { usuarios.set(this.id, this) },
  }
  usuarios.set(id, usuario)
  return usuario
}

const hashInicial = await bcrypt.hash('ClaveInicial123', 4)
const idAdmin = 'aaaaaaaaaaaaaaaaaaaaaaaa'
const idRecepcion = 'bbbbbbbbbbbbbbbbbbbbbbbb'
const idProfesional = 'cccccccccccccccccccccccc'
const idInactivo = 'dddddddddddddddddddddddd'
const idResponsable = 'eeeeeeeeeeeeeeeeeeeeeeee'
const idPaciente = 'ffffffffffffffffffffffff'

before(async () => {
  agregarUsuario(idAdmin, 'ADMINISTRADOR')
  agregarUsuario(idRecepcion, 'RECEPCIONISTA')
  agregarUsuario(idProfesional, 'PROFESIONAL')
  agregarUsuario(idInactivo, 'RECEPCIONISTA', false).correo = 'inactivo@example.test'

  Usuario.findById = (id) => consulta(usuarios.get(String(id)) ?? null)
  Usuario.findOne = ({ correo }) => consulta([...usuarios.values()].find((x) => x.correo === correo) ?? null)
  Usuario.find = () => ({ select: () => ({ sort: async () => [...usuarios.values()] }) })
  Usuario.countDocuments = async (filtro) => [...usuarios.values()].filter((x) =>
    x.rol === filtro.rol && x.activo === filtro.activo).length
  Usuario.create = async (datos) => {
    const usuario = { ...datos, id: randomBytes(12).toString('hex'), tokenVersion: 0,
      async save() { usuarios.set(this.id, this) } }
    usuarios.set(usuario.id, usuario)
    return usuario
  }
  Rol.find = () => ({ sort: () => ({ lean: async () => [...rolesPersonalizados.values()] }) })
  Rol.findOne = ({ codigo }) => ({ lean: async () => rolesPersonalizados.get(codigo) ?? null })
  Rol.exists = async ({ codigo }) => rolesPersonalizados.has(codigo)
  Rol.create = async (datos) => {
    if (rolesPersonalizados.has(datos.codigo)) {
      const error = new Error('Duplicado')
      error.code = 11000
      throw error
    }
    const rol = { ...datos }
    rolesPersonalizados.set(rol.codigo, rol)
    return rol
  }
  Rol.findOneAndUpdate = async ({ codigo }, datos) => {
    const rol = rolesPersonalizados.get(codigo)
    if (!rol) return null
    Object.assign(rol, datos)
    return rol
  }

  Responsable.countDocuments = async ({ _id }) => _id.$in.filter((id) => responsables.has(id)).length
  Responsable.exists = async () => null
  Responsable.create = async (datos) => {
    const responsable = { ...datos, id: idResponsable }
    responsables.set(idResponsable, responsable)
    return responsable
  }
  Responsable.findById = (id) => consulta(responsables.get(String(id)) ?? null)
  ImagenCargada.exists = async () => ({ _id: 'imagen-de-prueba' })
  Contador.findOneAndUpdate = async ({ _id }) => {
    const secuencia = (secuencias.get(_id) ?? 0) + 1
    secuencias.set(_id, secuencia)
    return { secuencia }
  }
  Paciente.exists = async () => null
  Paciente.findById = (id) => consulta(pacientes.get(String(id)) ?? null)
  Paciente.create = async (datos) => {
    const paciente = { ...datos, id: idPaciente, estado: 'ACTIVO' }
    pacientes.set(idPaciente, paciente)
    return paciente
  }
  Paciente.findByIdAndUpdate = async (id, datos) => {
    const paciente = pacientes.get(String(id))
    if (!paciente) return null
    Object.assign(paciente, datos)
    return paciente
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

async function entrar(correo) {
  return pedir('/api/auth/login', { metodo: 'POST', datos: { correo, password: 'ClaveInicial123' } })
}

test('login, datos públicos y usuario inactivo', async () => {
  const login = await entrar('administrador@example.test')
  assert.equal(login.status, 200)
  assert.equal(login.body.usuario.rol, 'ADMINISTRADOR')
  assert.equal('passwordHash' in login.body.usuario, false)
  const me = await pedir('/api/auth/me', { token: login.body.token })
  assert.equal(me.status, 200)
  assert.equal('passwordHash' in me.body.usuario, false)
  assert.equal((await entrar('inactivo@example.test')).status, 401)
  const inactivo = usuarios.get(idInactivo)
  inactivo.activo = true
  const sesion = await entrar('inactivo@example.test')
  inactivo.activo = false
  assert.equal((await pedir('/api/auth/me', { token: sesion.body.token })).status, 401)
})

test('permisos y compatibilidad PUT para usuarios', async () => {
  const admin = (await entrar('administrador@example.test')).body.token
  const recepcion = (await entrar('recepcionista@example.test')).body.token
  const profesional = (await entrar('profesional@example.test')).body.token
  for (const ruta of ['/api/usuarios', '/api/pacientes', '/api/responsables']) {
    assert.equal((await pedir(ruta)).status, 401)
  }
  assert.equal((await pedir('/api/usuarios', { token: recepcion })).status, 403)
  assert.equal((await pedir('/api/pacientes', { token: profesional })).status, 403)
  assert.equal((await pedir('/api/responsables', { token: profesional })).status, 403)
  const lista = await pedir('/api/usuarios', { token: admin })
  assert.equal(lista.status, 200)
  assert.equal('passwordHash' in lista.body.usuarios[0], false)
  const actualizado = await pedir(`/api/usuarios/${idRecepcion}`, { metodo: 'PUT', token: admin,
    datos: { nombre: 'Recepción' } })
  assert.equal(actualizado.status, 200)
  assert.equal(actualizado.body.usuario.nombre, 'Recepción')
  assert.equal((await pedir(`/api/usuarios/${idRecepcion}`, { metodo: 'PATCH', token: admin,
    datos: { password: 'NuevaClave123' } })).status, 400)
  assert.equal((await pedir(`/api/usuarios/${idAdmin}`, { metodo: 'PUT', token: admin,
    datos: { activo: false } })).status, 409)
})

test('restablecimiento protegido invalida sesiones anteriores', async () => {
  const admin = (await entrar('administrador@example.test')).body.token
  const anterior = (await entrar('profesional@example.test')).body.token
  const ruta = `/api/usuarios/${idProfesional}/password`
  assert.equal((await pedir(ruta, { metodo: 'PUT', token: admin,
    datos: { passwordAdministrador: 'incorrecta', passwordNueva: 'NuevaClave#456' } })).status, 403)
  assert.equal((await pedir(ruta, { metodo: 'PUT', token: admin,
    datos: { passwordAdministrador: 'ClaveInicial123', passwordNueva: 'NuevaClave#456' } })).status, 200)
  assert.equal((await pedir('/api/auth/me', { token: anterior })).status, 401)
  assert.equal((await entrar('profesional@example.test')).status, 401)
  const propia = await pedir('/api/auth/password', { metodo: 'PUT', token: admin,
    datos: { passwordActual: 'ClaveInicial123', passwordNueva: 'OtraClave#7891' } })
  assert.equal(propia.status, 200)
  assert.equal((await pedir('/api/auth/me', { token: admin })).status, 401)
})

test('administrador crea y edita un rol personalizado; la API aplica permisos de lectura y escritura', async () => {
  const admin = crearToken(usuarios.get(idAdmin))
  const lista = await pedir('/api/roles', { token: admin })
  assert.equal(lista.status, 200)
  assert.equal(lista.body.roles.length, 3)
  assert.equal((await pedir('/api/roles', { token: crearToken(usuarios.get(idRecepcion)) })).status, 403)
  const rol = await pedir('/api/roles', { metodo: 'POST', token: admin,
    datos: { nombre: 'Consulta de pacientes', permisos: ['PACIENTES_VER'] } })
  assert.equal(rol.status, 201)
  assert.equal(rol.body.rol.codigo, 'ROL_CONSULTA_DE_PACIENTES')
  assert.equal((await pedir('/api/roles', { metodo: 'POST', token: admin,
    datos: { nombre: 'Rol riesgoso', permisos: ['USUARIOS_GESTIONAR'] } })).status, 400)
  const nuevo = await pedir('/api/usuarios', { metodo: 'POST', token: admin,
    datos: { nombre: 'María Prueba', correo: 'maria@miumg.edu.gt',
      rol: rol.body.rol.codigo, password: 'Segura#8a' } })
  assert.equal(nuevo.status, 201)
  const token = crearToken(usuarios.get(nuevo.body.usuario.id))
  const sesion = await pedir('/api/auth/me', { token })
  assert.equal(sesion.status, 200)
  assert.deepEqual(sesion.body.usuario.permisos, ['PACIENTES_VER'])
  assert.equal((await pedir('/api/pacientes?estado=DESCONOCIDO', { token })).status, 400)
  assert.equal((await pedir('/api/pacientes', { metodo: 'POST', token, datos: {} })).status, 403)
  assert.equal((await pedir('/api/usuarios', { token })).status, 403)
  const actualizado = await pedir(`/api/roles/${rol.body.rol.codigo}`, { metodo: 'PUT', token: admin,
    datos: { nombre: 'Consulta y registro',
      permisos: ['PACIENTES_VER', 'PACIENTES_GESTIONAR', 'RESPONSABLES_VER'] } })
  assert.equal(actualizado.status, 200)
  assert.equal((await pedir('/api/pacientes', { metodo: 'POST', token, datos: {} })).status, 400)
  assert.equal((await pedir('/api/usuarios', { token })).status, 403)
})

test('pacientes y responsables validan asociación y baja lógica', async () => {
  const token = (await entrar('recepcionista@example.test')).body.token
  assert.equal((await pedir('/api/pacientes?estado=DESCONOCIDO', { token })).status, 400)
  assert.equal((await pedir('/api/responsables?buscar=a&buscar=b', { token })).status, 400)
  const responsable = { fotografia: '/api/imagenes/privadas/11111111-1111-4111-8111-111111111111', nombres: 'Ana', apellidos: 'Prueba',
    parentesco: 'Madre', telefono: '55551234', correo: 'ana@example.test', direccion: 'Prueba' }
  assert.equal((await pedir('/api/responsables', { metodo: 'POST', token,
    datos: { ...responsable, fotografia: 'https://example.test/publica.jpg' } })).status, 400)
  for (const telefono of ['05551234', '5555123', '555512345', '5555 1234', '5555ABCD']) {
    assert.equal((await pedir('/api/responsables', { metodo: 'POST', token,
      datos: { ...responsable, telefono } })).status, 400)
  }
  for (const correo of ['ana@dominio', 'ana@.com', 'ana dominio@example.com', 'ana@example.c']) {
    assert.equal((await pedir('/api/responsables', { metodo: 'POST', token,
      datos: { ...responsable, correo } })).status, 400)
  }
  const creado = await pedir('/api/responsables', { metodo: 'POST', token, datos: responsable })
  assert.equal(creado.status, 201)
  assert.equal(creado.body.responsable.codigo, 'RESPO-000001')
  assert.equal(responsables.get(idResponsable).codigo, 'RESPO-000001')
  assert.equal((await pedir('/api/responsables', { metodo: 'POST', token,
    datos: { ...responsable, codigo: 'RESPO-999999' } })).status, 400)
  assert.equal((await pedir(`/api/responsables/${idResponsable}`, { metodo: 'PUT', token,
    datos: { ...responsable, codigo: 'RESPO-999999' } })).status, 400)
  assert.equal((await pedir(`/api/responsables/${idResponsable}`, { metodo: 'PUT', token,
    datos: { ...responsable, telefono: '01234567' } })).status, 400)
  assert.equal((await pedir(`/api/responsables/${idResponsable}`, { metodo: 'PUT', token,
    datos: { ...responsable, correo: 'ana@dominio' } })).status, 400)
  const paciente = { fotografia: '/api/imagenes/privadas/22222222-2222-4222-8222-222222222222', nombres: 'Luis', apellidos: 'Prueba',
    fechaNacimiento: '2015-05-10', sexo: 'MASCULINO', telefono: '55551234',
    direccion: 'Prueba', fechaInicioProceso: '2026-10-20',
    observacionesAdministrativas: '', responsables: [idResponsable] }
  assert.equal((await pedir('/api/pacientes', { metodo: 'POST', token,
    datos: { ...paciente, responsables: ['111111111111111111111111'] } })).status, 400)
  const registro = await pedir('/api/pacientes', { metodo: 'POST', token, datos: paciente })
  assert.equal(registro.status, 201)
  assert.deepEqual(registro.body.paciente.responsables, [idResponsable])
  const sinAsociacion = await pedir(`/api/pacientes/${idPaciente}`, { metodo: 'PUT', token,
    datos: { ...paciente, responsables: [] } })
  assert.equal(sinAsociacion.status, 200)
  const asociadoOtraVez = await pedir(`/api/pacientes/${idPaciente}`, { metodo: 'PUT', token,
    datos: paciente })
  assert.equal(asociadoOtraVez.status, 200)
  assert.deepEqual(asociadoOtraVez.body.paciente.responsables, [idResponsable])
  for (const telefono of ['05551234', '5555123', '555512345', '5555 1234', '5555ABCD']) {
    const rechazo = await pedir('/api/pacientes', { metodo: 'POST', token,
      datos: { ...paciente, telefono } })
    assert.equal(rechazo.status, 400)
  }
  for (const fechas of [
    { fechaNacimiento: '2099-01-01' },
    { fechaNacimiento: '1800-01-01' },
    { fechaInicioProceso: '2099-01-01' },
    { fechaInicioProceso: '2010-01-01' },
  ]) {
    const rechazo = await pedir('/api/pacientes', { metodo: 'POST', token,
      datos: { ...paciente, ...fechas } })
    assert.equal(rechazo.status, 400)
  }
  assert.equal((await pedir(`/api/pacientes/${idPaciente}`, { metodo: 'PUT', token,
    datos: { ...paciente, telefono: '01234567' } })).status, 400)
  assert.equal(registro.body.paciente.codigo, 'PAC-000001')
  assert.equal(pacientes.get(idPaciente).codigo, 'PAC-000001')
  assert.equal((await pedir('/api/pacientes', { metodo: 'POST', token,
    datos: { ...paciente, codigo: 'PAC-999999' } })).status, 400)
  assert.equal((await pedir(`/api/pacientes/${idPaciente}`, { metodo: 'PUT', token,
    datos: { ...paciente, codigo: 'PAC-999999' } })).status, 400)
  assert.equal(pacientes.get(idPaciente).codigo, 'PAC-000001')
  const partesHoy = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const hoy = Object.fromEntries(partesHoy.map(({ type, value }) => [type, value]))
  const yaCumplio = Number(hoy.month) > 5 ||
    (Number(hoy.month) === 5 && Number(hoy.day) >= 10)
  assert.equal(registro.body.paciente.edad, Number(hoy.year) - 2015 - (yaCumplio ? 0 : 1))
  assert.equal('edad' in pacientes.get(idPaciente), false)
  const baja = await pedir(`/api/pacientes/${idPaciente}/estado`, { metodo: 'PATCH', token,
    datos: { estado: 'INACTIVO' } })
  assert.equal(baja.status, 200)
  assert.equal(pacientes.get(idPaciente).estado, 'INACTIVO')
  assert.equal(pacientes.size, 1)
})
