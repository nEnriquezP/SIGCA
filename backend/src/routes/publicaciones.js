import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Publicacion from '../models/Publicacion.js'
import { imagenValida } from '../models/Servicio.js'

const router = Router()

function texto(valor, maximo) {
  return typeof valor === 'string' && Boolean(valor.trim()) && valor.trim().length <= maximo
}

function enlaceValido(valor) {
  if (typeof valor !== 'string' || valor.length > 500) return false
  return !valor || imagenValida(valor)
}

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 5 ||
      Object.keys(datos).some((clave) => !['titulo', 'descripcion', 'fechaPublicacion', 'imagen', 'enlace'].includes(clave)) ||
      !texto(datos.titulo, 160) || !texto(datos.descripcion, 4000) ||
      !fechaValida(datos.fechaPublicacion) || typeof datos.imagen !== 'string' ||
      (datos.imagen && !imagenValida(datos.imagen)) || !enlaceValido(datos.enlace)) {
    return 'Publicación inválida: revisa título, descripción, fecha e imagen o enlace'
  }
  return null
}

function limpiar(datos) {
  return { titulo: datos.titulo.trim(), descripcion: datos.descripcion.trim(),
    fechaPublicacion: datos.fechaPublicacion, imagen: datos.imagen.trim(),
    enlace: datos.enlace.trim() }
}

function respuesta(item, privado = false) {
  const datos = { id: item.id, titulo: item.titulo, descripcion: item.descripcion,
    fechaPublicacion: item.fechaPublicacion, imagen: item.imagen, enlace: item.enlace }
  if (privado) datos.activo = item.activo
  return datos
}

router.get('/', async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const items = await Publicacion.find({ activo: true }).sort({ fechaPublicacion: -1, _id: -1 }).limit(100)
  res.json({ publicaciones: items.map((item) => respuesta(item)) })
})

router.get('/administracion', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const items = await Publicacion.find().sort({ fechaPublicacion: -1, _id: -1 }).limit(100)
  res.json({ publicaciones: items.map((item) => respuesta(item, true)) })
})

router.post('/', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const item = await Publicacion.create(limpiar(req.body))
  res.status(201).json({ publicacion: respuesta(item, true) })
})

router.put('/:id', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const item = await Publicacion.findByIdAndUpdate(req.params.id, limpiar(req.body),
    { returnDocument: 'after', runValidators: true })
  if (!item) return res.status(404).json({ mensaje: 'Publicación no encontrada' })
  res.json({ publicacion: respuesta(item, true) })
})

router.patch('/:id/estado', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.activo !== 'boolean') {
    return res.status(400).json({ mensaje: 'Estado inválido' })
  }
  const item = await Publicacion.findByIdAndUpdate(req.params.id, { activo: req.body.activo },
    { returnDocument: 'after', runValidators: true })
  if (!item) return res.status(404).json({ mensaje: 'Publicación no encontrada' })
  res.json({ publicacion: respuesta(item, true) })
})

export default router
