import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Servicio, { imagenValida } from '../models/Servicio.js'

const router = Router()
const campos = ['nombre', 'descripcion', 'duracionMinutos', 'precioCentavos', 'imagen']

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== campos.length ||
      Object.keys(datos).some((campo) => !campos.includes(campo))) {
    return 'Debes completar los campos del servicio'
  }
  if (typeof datos.nombre !== 'string' || datos.nombre.trim().length > 120 ||
      !/^[\p{L}\p{N}]+(?:[ _-][\p{L}\p{N}]+)*$/u.test(datos.nombre.trim())) {
    return 'El nombre solo admite letras, números, espacios, guion y guion bajo'
  }
  if (typeof datos.descripcion !== 'string' || !datos.descripcion.trim() ||
      datos.descripcion.trim().length > 2000) return 'Descripción inválida'
  if (!Number.isInteger(datos.duracionMinutos) || datos.duracionMinutos < 1 ||
      datos.duracionMinutos > 1440) return 'Duración inválida'
  if (!Number.isSafeInteger(datos.precioCentavos) || datos.precioCentavos < 100 ||
      datos.precioCentavos > 3000000000) return 'El precio debe estar entre Q1.00 y Q30,000,000.00'
  if (!imagenValida(datos.imagen)) return 'Imagen inválida: usa una URL HTTP(S) o ruta que inicie con /'
  return null
}

function limpiar(datos) {
  return {
    nombre: datos.nombre.trim(), descripcion: datos.descripcion.trim(),
    duracionMinutos: datos.duracionMinutos, precioCentavos: datos.precioCentavos,
    imagen: datos.imagen.trim(),
  }
}

function respuesta(servicio) {
  return {
    id: servicio.id, nombre: servicio.nombre, descripcion: servicio.descripcion,
    duracionMinutos: servicio.duracionMinutos, precioCentavos: servicio.precioCentavos,
    imagen: servicio.imagen, estado: servicio.estado,
  }
}

function filtros(req, { privado = false } = {}) {
  const permitidos = privado ? ['buscar', 'estado'] : ['buscar']
  if (Object.keys(req.query).some((campo) => !permitidos.includes(campo)) ||
      (req.query.buscar !== undefined && typeof req.query.buscar !== 'string') ||
      (req.query.estado !== undefined && typeof req.query.estado !== 'string')) {
    return { error: 'Filtros inválidos' }
  }
  const buscar = (req.query.buscar ?? '').trim()
  if (buscar.length > 80) return { error: 'Búsqueda demasiado larga' }
  const filtro = privado ? {} : { estado: 'ACTIVO' }
  if (privado && req.query.estado !== undefined) {
    if (!['ACTIVO', 'INACTIVO'].includes(req.query.estado)) {
      return { error: 'Estado inválido' }
    }
    filtro.estado = req.query.estado
  }
  if (buscar) {
    const patron = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const condiciones = ['nombre', 'descripcion'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (mongoose.isValidObjectId(buscar)) condiciones.push({ _id: buscar })
    filtro.$or = condiciones
  }
  return { filtro }
}

router.get('/', async (req, res) => {
  const { filtro, error } = filtros(req)
  if (error) return res.status(400).json({ mensaje: error })
  const servicios = await Servicio.find(filtro).sort({ nombre: 1 }).limit(100)
  res.json({ servicios: servicios.map(respuesta) })
})

router.get('/administracion', autenticar,
  permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'), async (req, res) => {
    const { filtro, error } = filtros(req, { privado: true })
    if (error) return res.status(400).json({ mensaje: error })
    const servicios = await Servicio.find(filtro).sort({ nombre: 1 }).limit(100)
    res.json({ servicios: servicios.map(respuesta) })
  })

router.get('/administracion/:id', autenticar,
  permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'), async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ mensaje: 'Identificador inválido' })
    }
    const servicio = await Servicio.findById(req.params.id)
    if (!servicio) return res.status(404).json({ mensaje: 'Servicio no encontrado' })
    res.json({ servicio: respuesta(servicio) })
  })

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const servicio = await Servicio.findOne({ _id: req.params.id, estado: 'ACTIVO' })
  if (!servicio) return res.status(404).json({ mensaje: 'Servicio no encontrado' })
  res.json({ servicio: respuesta(servicio) })
})

router.post('/', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const servicio = await Servicio.create(limpiar(req.body))
  res.status(201).json({ servicio: respuesta(servicio) })
})

router.put('/:id', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const servicio = await Servicio.findByIdAndUpdate(req.params.id, limpiar(req.body),
    { returnDocument: 'after', runValidators: true })
  if (!servicio) return res.status(404).json({ mensaje: 'Servicio no encontrado' })
  res.json({ servicio: respuesta(servicio) })
})

router.patch('/:id/estado', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !['ACTIVO', 'INACTIVO'].includes(req.body.estado)) {
    return res.status(400).json({ mensaje: 'Estado inválido' })
  }
  const servicio = await Servicio.findByIdAndUpdate(req.params.id,
    { estado: req.body.estado }, { returnDocument: 'after', runValidators: true })
  if (!servicio) return res.status(404).json({ mensaje: 'Servicio no encontrado' })
  res.json({ servicio: respuesta(servicio) })
})

export default router
