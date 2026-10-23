import { Router } from 'express'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Usuario from '../models/Usuario.js'

const router = Router()
const roles = new Set(['ADMINISTRADOR', 'RECEPCIONISTA', 'PROFESIONAL'])

router.use(autenticar, permitirRoles('ADMINISTRADOR'))

function respuestaUsuario(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    activo: usuario.activo,
  }
}

function validarCampos(datos, { nuevo = false } = {}) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    return 'Datos de usuario inválidos'
  }

  const permitidos = ['nombre', 'correo', 'rol', 'activo', 'password']
  const campos = Object.keys(datos)
  if (!campos.length || campos.some((campo) => !permitidos.includes(campo))) {
    return 'Campos de usuario inválidos'
  }

  if (nuevo && !['nombre', 'correo', 'rol', 'password'].every((campo) => campo in datos)) {
    return 'Nombre, correo, rol y contraseña son obligatorios'
  }
  if (nuevo && 'activo' in datos) return 'El usuario nuevo debe iniciar activo'

  if ('nombre' in datos &&
      (typeof datos.nombre !== 'string' || !datos.nombre.trim() || datos.nombre.trim().length > 120)) {
    return 'Nombre inválido'
  }

  if ('correo' in datos &&
      (typeof datos.correo !== 'string' || datos.correo.length > 254 ||
       !/^\S+@\S+\.\S+$/.test(datos.correo.trim()))) {
    return 'Correo inválido'
  }

  if ('rol' in datos && !roles.has(datos.rol)) return 'Rol inválido'
  if ('activo' in datos && typeof datos.activo !== 'boolean') return 'Estado inválido'
  if ('password' in datos &&
      (typeof datos.password !== 'string' || datos.password.length < 12 ||
       Buffer.byteLength(datos.password, 'utf8') > 72)) {
    return 'La contraseña debe tener entre 12 caracteres y 72 bytes'
  }

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
    .select('nombre correo rol activo')
    .sort({ nombre: 1 })
  res.json({ usuarios: usuarios.map(respuestaUsuario) })
})

router.post('/', async (req, res) => {
  const error = validarCampos(req.body, { nuevo: true })
  if (error) return res.status(400).json({ mensaje: error })

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

router.patch('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }

  const error = validarCampos(req.body)
  if (error) return res.status(400).json({ mensaje: error })

  const usuario = await Usuario.findById(req.params.id)
  if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' })

  const { nombre, correo, rol, activo, password } = req.body
  const cambiaRol = rol !== undefined && rol !== usuario.rol
  const desactiva = activo === false && usuario.activo

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
  if (password !== undefined) usuario.passwordHash = await bcrypt.hash(password, 12)

  try {
    await usuario.save()
    res.json({ usuario: respuestaUsuario(usuario) })
  } catch (errorActualizacion) {
    if (!errorDeDuplicado(errorActualizacion, res)) throw errorActualizacion
  }
})

export default router
