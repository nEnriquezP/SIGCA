import { Router } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Usuario from '../models/Usuario.js'
import Rol from '../models/Rol.js'
import { correoCuentaValido, nombreCuentaValido, passwordNuevaValida,
  REGLA_PASSWORD } from '../services/validacionCuenta.js'

const router = Router()
const roles = new Set(['ADMINISTRADOR', 'RECEPCIONISTA', 'PROFESIONAL'])

router.use(autenticar, permitirRoles('ADMINISTRADOR'))

function respuestaUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    avatar: usuario.avatar || '',
    fotografia: usuario.fotografia || '',
    activo: usuario.activo,
  }
}

function validarCampos(datos, { nuevo = false } = {}) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return 'Datos de usuario inválidos'
  }

  const permitidos = nuevo ? ['nombre', 'correo', 'rol', 'password'] :
    ['nombre', 'correo', 'rol', 'activo']
  const campos = Object.keys(datos)
  if (!campos.length || campos.some((campo) => !permitidos.includes(campo))) {
    return 'Campos de usuario inválidos'
  }

  if (nuevo && !['nombre', 'correo', 'rol', 'password'].every((campo) => campo in datos)) {
    return 'Nombre, correo, rol y contraseña son obligatorios'
  }
  if ('nombre' in datos && !nombreCuentaValido(datos.nombre)) return 'El nombre solo puede contener letras y espacios'

  if ('correo' in datos && !correoCuentaValido(datos.correo)) return 'Correo electrónico inválido'

  if ('rol' in datos && !roles.has(datos.rol) &&
      (typeof datos.rol !== 'string' || !/^ROL_[A-Z0-9_]{2,40}$/.test(datos.rol))) return 'Rol inválido'
  if ('activo' in datos && typeof datos.activo !== 'boolean') return 'Estado inválido'
  if ('password' in datos && !passwordNuevaValida(datos.password)) return REGLA_PASSWORD

  return null
}

function errorDeDuplicado(error, res) {
  if (error.code === 11000) {
    res.status(409).json({ mensaje: 'Ya existe un usuario con ese correo' })
    return true
  }
  return false
}

router.get('/', async (req, res) => {
  const usuarios = await Usuario.find()
    .select('nombre correo rol activo avatar fotografia')
    .sort({ nombre: 1 })
  res.json({ usuarios: usuarios.map(respuestaUsuario) })
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const usuario = await Usuario.findById(req.params.id)
  if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' })
  res.json({ usuario: respuestaUsuario(usuario) })
})

router.post('/', async (req, res) => {
  const error = validarCampos(req.body, { nuevo: true })
  if (error) return res.status(400).json({ mensaje: error })
  if (!roles.has(req.body.rol) && !await Rol.exists({ codigo: req.body.rol })) {
    return res.status(400).json({ mensaje: 'Rol no encontrado' })
  }

  const { nombre, correo, password, rol } = req.body
  try {
    const usuario = await Usuario.create({
      nombre: nombre.trim(),
      correo: correo.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 12),
      rol,
      activo: true,
    })
    res.status(201).json({ usuario: respuestaUsuario(usuario) })
  } catch (errorCreacion) {
    if (!errorDeDuplicado(errorCreacion, res)) throw errorCreacion
  }
})

async function actualizarUsuario(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }

  const error = validarCampos(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  if (req.body.rol && !roles.has(req.body.rol) && !await Rol.exists({ codigo: req.body.rol })) {
    return res.status(400).json({ mensaje: 'Rol no encontrado' })
  }

  const usuario = await Usuario.findById(req.params.id).select('+tokenVersion')
  if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' })

  const { nombre, correo, rol, activo } = req.body
  const cambiaRol = rol !== undefined && rol !== usuario.rol
  const desactiva = activo === false && usuario.activo
  const cambiaEstado = activo !== undefined && activo !== usuario.activo

  if (usuario.id === req.usuario.id && (cambiaRol || desactiva)) {
    return res.status(409).json({ mensaje: 'No puedes cambiar tu propio rol ni desactivar tu cuenta' })
  }

  if (usuario.rol === 'ADMINISTRADOR' && usuario.activo && (cambiaRol || desactiva) &&
      await Usuario.countDocuments({ rol: 'ADMINISTRADOR', activo: true }) <= 1) {
    return res.status(409).json({ mensaje: 'Debe permanecer al menos un administrador activo' })
  }

  if (nombre !== undefined) usuario.nombre = nombre.trim()
  if (correo !== undefined) usuario.correo = correo.trim().toLowerCase()
  if (rol !== undefined) usuario.rol = rol
  if (activo !== undefined) usuario.activo = activo
  if (cambiaRol || cambiaEstado) usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1

  try {
    await usuario.save()
    res.json({ usuario: respuestaUsuario(usuario) })
  } catch (errorActualizacion) {
    if (!errorDeDuplicado(errorActualizacion, res)) throw errorActualizacion
  }
}

router.patch('/:id', actualizarUsuario)
router.put('/:id', actualizarUsuario)

router.put('/:id/password', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const datos = req.body
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 || !('passwordAdministrador' in datos) ||
      !('passwordNueva' in datos) || typeof datos.passwordAdministrador !== 'string' ||
      Buffer.byteLength(datos.passwordAdministrador, 'utf8') > 72 ||
      !passwordNuevaValida(datos.passwordNueva)) {
    return res.status(400).json({ mensaje: REGLA_PASSWORD })
  }

  const administrador = await Usuario.findById(req.usuario.id).select('+passwordHash')
  if (!administrador || !administrador.activo) {
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' })
  }
  if (!await bcrypt.compare(datos.passwordAdministrador, administrador.passwordHash)) {
    return res.status(403).json({ mensaje: 'Contraseña del administrador incorrecta' })
  }
  const usuario = await Usuario.findById(req.params.id).select('+passwordHash +tokenVersion')
  if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' })
  if (await bcrypt.compare(datos.passwordNueva, usuario.passwordHash)) {
    return res.status(400).json({ mensaje: 'La nueva contraseña debe ser diferente' })
  }

  usuario.passwordHash = await bcrypt.hash(datos.passwordNueva, 12)
  usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1
  await usuario.save()
  res.json({ mensaje: 'Contraseña restablecida' })
})

export default router
