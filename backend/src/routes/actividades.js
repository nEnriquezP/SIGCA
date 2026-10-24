import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Actividad from '../models/Actividad.js'
import { imagenValida } from '../models/Servicio.js'

const router = Router()
const tipos = ['CAPACITACION', 'ESCUELA_PADRES', 'OTRA']

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 4 ||
      Object.keys(datos).some((clave) => !['tipo', 'titulo', 'descripcion', 'imagenes'].includes(clave)) ||
      !tipos.includes(datos.tipo) || typeof datos.titulo !== 'string' ||
      !datos.titulo.trim() || datos.titulo.trim().length > 160 ||
      typeof datos.descripcion !== 'string' || !datos.descripcion.trim() ||
      datos.descripcion.trim().length > 4000 || !Array.isArray(datos.imagenes) ||
      datos.imagenes.length > 10 || !datos.imagenes.every(imagenValida)) {
    return 'Actividad inválida: revisa tipo, título, descripción e imágenes'
  }
  return null
}

function limpiar(datos) {
  return { tipo: datos.tipo, titulo: datos.titulo.trim(),
    descripcion: datos.descripcion.trim(),
    imagenes: datos.imagenes.map((imagen) => imagen.trim()) }
}

function respuesta(item, privado = false) {
  const datos = { id: item.id, tipo: item.tipo, titulo: item.titulo,
    descripcion: item.descripcion, imagenes: item.imagenes }
  if (privado) datos.activo = item.activo
  return datos
}

router.get('/', async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const items = await Actividad.find({ activo: true }).sort({ createdAt: -1 }).limit(100)
  res.json({ actividades: items.map((item) => respuesta(item)) })
})

router.get('/administracion', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const items = await Actividad.find().sort({ createdAt: -1 }).limit(100)
  res.json({ actividades: items.map((item) => respuesta(item, true)) })
})

router.post('/', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const item = await Actividad.create(limpiar(req.body))
  res.status(201).json({ actividad: respuesta(item, true) })
})

router.put('/:id', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const item = await Actividad.findByIdAndUpdate(req.params.id, limpiar(req.body),
    { returnDocument: 'after', runValidators: true })
  if (!item) return res.status(404).json({ mensaje: 'Actividad no encontrada' })
  res.json({ actividad: respuesta(item, true) })
})

router.patch('/:id/estado', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.activo !== 'boolean') {
    return res.status(400).json({ mensaje: 'Estado inválido' })
  }
  const item = await Actividad.findByIdAndUpdate(req.params.id, { activo: req.body.activo },
    { returnDocument: 'after', runValidators: true })
  if (!item) return res.status(404).json({ mensaje: 'Actividad no encontrada' })
  res.json({ actividad: respuesta(item, true) })
})

export default router
