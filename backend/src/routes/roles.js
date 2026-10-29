import { Router } from 'express'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Rol from '../models/Rol.js'
import { CATALOGO_PERMISOS, PERMISOS_PREDEFINIDOS, permisosValidos } from '../services/permisos.js'

const router = Router()
router.use(autenticar, permitirRoles('ADMINISTRADOR'))

function datosRol(rol) {
  return { codigo: rol.codigo, nombre: rol.nombre, permisos: rol.permisos, predefinido: false }
}

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 || !('nombre' in datos) || !('permisos' in datos)) {
    return 'Nombre y permisos son obligatorios'
  }
  if (typeof datos.nombre !== 'string' || !/^[\p{L}\p{N}]+(?:[ _-][\p{L}\p{N}]+)*$/u.test(datos.nombre.trim()) ||
      datos.nombre.trim().length > 60) return 'Nombre de rol inválido'
  if (!permisosValidos(datos.permisos)) return 'Permisos inválidos'
  return null
}

router.get('/', async (req, res) => {
  const personalizados = await Rol.find().sort({ nombre: 1 }).lean()
  res.json({ catalogo: CATALOGO_PERMISOS, roles: [
    ...Object.entries(PERMISOS_PREDEFINIDOS).map(([codigo, permisos]) =>
      ({ codigo, nombre: codigo, permisos, predefinido: true })),
    ...personalizados.map(datosRol),
  ] })
})

router.post('/', async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const codigoBase = req.body.nombre.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)
  const codigo = `ROL_${codigoBase}`
  if (!/^ROL_[A-Z0-9_]{2,40}$/.test(codigo)) {
    return res.status(400).json({ mensaje: 'Usa un nombre de rol más descriptivo' })
  }
  try {
    const rol = await Rol.create({ codigo, nombre: req.body.nombre.trim(),
      permisos: req.body.permisos })
    res.status(201).json({ rol: datosRol(rol) })
  } catch (fallo) {
    if (fallo.code === 11000) return res.status(409).json({ mensaje: 'Ya existe un rol con ese nombre' })
    throw fallo
  }
})

router.put('/:codigo', async (req, res) => {
  if (!/^ROL_[A-Z0-9_]{2,40}$/.test(req.params.codigo)) {
    return res.status(400).json({ mensaje: 'Solo se pueden editar roles personalizados' })
  }
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const rol = await Rol.findOneAndUpdate({ codigo: req.params.codigo },
    { nombre: req.body.nombre.trim(), permisos: req.body.permisos },
    { returnDocument: 'after', runValidators: true })
  if (!rol) return res.status(404).json({ mensaje: 'Rol no encontrado' })
  res.json({ rol: datosRol(rol) })
})

export default router
