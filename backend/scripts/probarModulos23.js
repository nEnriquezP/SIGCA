import 'dotenv/config'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import app from '../src/app.js'
import Usuario from '../src/models/Usuario.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import ImagenCargada from '../src/models/ImagenCargada.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')

const creados = { usuarios: [], pacientes: [], responsables: [], imagenes: [] }
const sufijo = randomBytes(8).toString('hex')
const passwordInicial = randomBytes(18).toString('base64url')
const passwordNueva = randomBytes(18).toString('base64url')
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

async function iniciar(correo, password) {
  return pedir('/api/auth/login', { metodo: 'POST', datos: { correo, password } })
}

async function fotoFicticia(categoria) {
  const id = randomUUID()
  const valor = `/api/imagenes/privadas/${id}`
  await ImagenCargada.create({ _id: id, categoria, valor, privada: true,
    publicId: `sigca/test/${categoria}/${id}` })
  creados.imagenes.push(id)
  return valor
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

  const correoAdmin = `admin-${sufijo}@example.test`
  const admin = await Usuario.create({
    nombre: 'Administrador de prueba', correo: correoAdmin,
    passwordHash: await bcrypt.hash(passwordInicial, 12), rol: 'ADMINISTRADOR',
  })
  creados.usuarios.push(admin.id)

  const loginAdmin = await iniciar(correoAdmin, passwordInicial)
  verificar(loginAdmin.status, 200, 'El administrador puede iniciar sesión')
  verificar('passwordHash' in loginAdmin.body.usuario, false, 'La respuesta no expone hash')
  const tokenAdmin = loginAdmin.body.token
  verificar((await pedir('/api/auth/me', { token: tokenAdmin })).status, 200,
    'La sesión puede consultarse')
  verificar((await pedir('/api/usuarios')).status, 401, 'Usuarios requiere sesión')
  verificar((await pedir('/api/pacientes')).status, 401, 'Pacientes requiere sesión')
  verificar((await pedir('/api/responsables')).status, 401, 'Responsables requiere sesión')

  async function crearUsuario(rol) {
    const correo = `${rol.toLowerCase()}-${sufijo}@example.test`
    const respuesta = await pedir('/api/usuarios', { metodo: 'POST', token: tokenAdmin,
      datos: { nombre: `${rol} de prueba`, correo, rol, password: passwordInicial } })
    verificar(respuesta.status, 201, `Se crea ${rol}`)
    verificar('passwordHash' in respuesta.body.usuario, false, 'Alta sin hash')
    creados.usuarios.push(respuesta.body.usuario.id)
    return { id: respuesta.body.usuario.id, correo }
  }

  const recepcion = await crearUsuario('RECEPCIONISTA')
  const profesional = await crearUsuario('PROFESIONAL')
  const tokenRecepcion = (await iniciar(recepcion.correo, passwordInicial)).body.token
  const tokenProfesional = (await iniciar(profesional.correo, passwordInicial)).body.token
  verificar((await pedir('/api/usuarios', { token: tokenRecepcion })).status, 403,
    'Recepción no administra usuarios')
  verificar((await pedir('/api/pacientes', { token: tokenProfesional })).status, 403,
    'Profesional no consulta todos los pacientes')
  verificar((await pedir('/api/responsables', { token: tokenProfesional })).status, 403,
    'Profesional no consulta todos los responsables')

  const detalleUsuario = await pedir(`/api/usuarios/${recepcion.id}`, { token: tokenAdmin })
  verificar(detalleUsuario.status, 200, 'Se consulta usuario')
  verificar('passwordHash' in detalleUsuario.body.usuario, false, 'Detalle sin hash')
  const usuariosListados = await pedir('/api/usuarios', { token: tokenAdmin })
  verificar(usuariosListados.status, 200, 'Se listan usuarios')
  verificar(usuariosListados.body.usuarios.every((item) => !('passwordHash' in item)), true,
    'La lista no expone hashes')
  verificar((await pedir(`/api/usuarios/${recepcion.id}`, { metodo: 'PUT', token: tokenAdmin,
    datos: { nombre: 'Recepción modificada' } })).status, 200, 'PUT actualiza usuario')
  verificar((await pedir(`/api/usuarios/${recepcion.id}`, { metodo: 'PUT', token: tokenAdmin,
    datos: { rol: 'PROFESIONAL' } })).status, 200, 'Se modifica el rol')
  verificar((await pedir('/api/auth/me', { token: tokenRecepcion })).status, 401,
    'El cambio de rol revoca la sesión anterior')
  verificar((await pedir(`/api/usuarios/${recepcion.id}`, { metodo: 'PUT', token: tokenAdmin,
    datos: { rol: 'RECEPCIONISTA' } })).status, 200, 'Se restaura el rol de prueba')
  verificar((await pedir(`/api/usuarios/${admin.id}`, { metodo: 'PATCH', token: tokenAdmin,
    datos: { activo: false } })).status, 409, 'No se desactiva al único administrador')

  verificar((await pedir(`/api/usuarios/${profesional.id}/password`, {
    metodo: 'PUT', token: tokenAdmin,
    datos: { passwordAdministrador: 'incorrecta', passwordNueva },
  })).status, 403, 'Restablecimiento exige clave del administrador')
  verificar((await pedir(`/api/usuarios/${profesional.id}/password`, {
    metodo: 'PUT', token: tokenAdmin,
    datos: { passwordAdministrador: passwordInicial, passwordNueva },
  })).status, 200, 'Restablecimiento autorizado')
  verificar((await pedir('/api/auth/me', { token: tokenProfesional })).status, 401,
    'La sesión anterior queda revocada')
  verificar((await iniciar(profesional.correo, passwordNueva)).status, 200,
    'La contraseña nueva funciona')

  verificar((await pedir(`/api/usuarios/${recepcion.id}`, { metodo: 'PATCH', token: tokenAdmin,
    datos: { activo: false } })).status, 200, 'Se desactiva usuario')
  verificar((await iniciar(recepcion.correo, passwordInicial)).status, 401,
    'Usuario inactivo no inicia sesión')
  verificar((await pedir('/api/auth/me', { token: tokenRecepcion })).status, 401,
    'Usuario inactivo pierde acceso')
  verificar((await pedir(`/api/usuarios/${recepcion.id}`, { metodo: 'PATCH', token: tokenAdmin,
    datos: { activo: true } })).status, 200, 'Se reactiva usuario')
  verificar((await pedir('/api/auth/me', { token: tokenRecepcion })).status, 401,
    'La sesión vieja sigue revocada después de reactivar')
  const tokenRecepcionNuevo = (await iniciar(recepcion.correo, passwordInicial)).body.token

  const responsableDatos = { fotografia: await fotoFicticia('responsable'), nombres: 'Ana',
    apellidos: `Prueba ${sufijo}`, parentesco: 'Madre', telefono: '5555 5555',
    correo: `responsable-${sufijo}@example.test`, direccion: 'Dirección ficticia' }
  const responsable = await pedir('/api/responsables', { metodo: 'POST', token: tokenRecepcionNuevo,
    datos: responsableDatos })
  verificar(responsable.status, 201, 'Se registra responsable')
  creados.responsables.push(responsable.body.responsable.id)
  const idResponsable = responsable.body.responsable.id

  const pacienteDatos = { fotografia: await fotoFicticia('paciente'), nombres: 'Luis',
    apellidos: `Prueba ${sufijo}`, fechaNacimiento: '2015-05-10', sexo: 'MASCULINO',
    telefono: '5555 5555', direccion: 'Dirección ficticia', fechaInicioProceso: '2026-10-20',
    observacionesAdministrativas: 'Dato ficticio', responsables: [idResponsable] }
  verificar((await pedir('/api/pacientes', { metodo: 'POST', token: tokenRecepcionNuevo,
    datos: { ...pacienteDatos, responsables: ['111111111111111111111111'] } })).status, 400,
  'No se asocia un responsable inexistente')
  const paciente = await pedir('/api/pacientes', { metodo: 'POST', token: tokenRecepcionNuevo,
    datos: pacienteDatos })
  verificar(paciente.status, 201, 'Se registra paciente')
  creados.pacientes.push(paciente.body.paciente.id)
  const idPaciente = paciente.body.paciente.id
  verificar(Number.isInteger(paciente.body.paciente.edad), true, 'La edad se calcula')
  verificar((await Paciente.findById(idPaciente)).toObject().edad, undefined,
    'La edad no se almacena')
  const pacienteDetalle = await pedir(`/api/pacientes/${idPaciente}`, { token: tokenRecepcionNuevo })
  verificar(pacienteDetalle.body.paciente.responsables[0].id, idResponsable,
    'El paciente consulta su responsable')
  const responsableDetalle = await pedir(`/api/responsables/${idResponsable}`,
    { token: tokenRecepcionNuevo })
  verificar(responsableDetalle.body.responsable.pacientes[0].id, idPaciente,
    'La consulta inversa encuentra al paciente')
  verificar((await pedir(`/api/pacientes?buscar=${idPaciente}`, { token: tokenRecepcionNuevo }))
    .body.pacientes.some((item) => item.id === idPaciente), true,
  'Se busca paciente por identificador')
  verificar((await pedir(`/api/responsables?buscar=${idResponsable}`, { token: tokenRecepcionNuevo }))
    .body.responsables.some((item) => item.id === idResponsable), true,
  'Se busca responsable por identificador')
  verificar((await pedir(`/api/responsables/${idResponsable}`, { metodo: 'PUT',
    token: tokenRecepcionNuevo, datos: { ...responsableDatos, telefono: '5555 4444' } })).status,
  200, 'Se modifica responsable')
  verificar((await pedir(`/api/pacientes/${idPaciente}`, { metodo: 'PUT',
    token: tokenRecepcionNuevo, datos: { ...pacienteDatos, telefono: '5555 3333' } })).status,
  200, 'Se modifica paciente')
  verificar((await pedir(`/api/pacientes/${idPaciente}/estado`, { metodo: 'PATCH',
    token: tokenRecepcionNuevo, datos: { estado: 'INACTIVO' } })).status, 200,
  'Se desactiva paciente sin borrarlo')
  verificar((await Paciente.findById(idPaciente)).estado, 'INACTIVO',
    'El documento del paciente permanece')
  verificar((await pedir('/api/auth/password', { metodo: 'PUT', token: tokenAdmin,
    datos: { passwordActual: passwordInicial, passwordNueva } })).status, 200,
  'El administrador cambia su contraseña')
  verificar((await pedir('/api/auth/me', { token: tokenAdmin })).status, 401,
    'Su sesión anterior queda revocada')
}

try {
  await ejecutar()
  console.log(`EXITOSA: ${comprobaciones} comprobaciones en sigca_test`)
} catch {
  console.error(`FALLIDA: prueba de integración tras ${comprobaciones} comprobaciones`)
  process.exitCode = 1
} finally {
  if (mongoose.connection.name === 'sigca_test') {
    try {
      await Paciente.deleteMany({ _id: { $in: creados.pacientes } })
      await Responsable.deleteMany({ _id: { $in: creados.responsables } })
      await ImagenCargada.deleteMany({ _id: { $in: creados.imagenes } })
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
