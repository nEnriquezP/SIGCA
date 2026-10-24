import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import MensajeContacto from '../models/MensajeContacto.js'

const router = Router()
const limitarEnvios = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { mensaje: 'Demasiados mensajes. Intenta de nuevo en 15 minutos.' },
})
const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const telefonoValido = /^[+\d][\d\s()+.-]{6,29}$/

function texto(valor, maximo) {
  return typeof valor === 'string' && Boolean(valor.trim()) && valor.trim().length <= maximo
}

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 5 ||
      Object.keys(datos).some((clave) => !['nombre', 'correo', 'telefono', 'asunto', 'mensaje'].includes(clave)) ||
      !texto(datos.nombre, 120) || !texto(datos.correo, 254) ||
      !correoValido.test(datos.correo.trim()) || !texto(datos.telefono, 30) ||
      !telefonoValido.test(datos.telefono.trim()) ||
      !texto(datos.asunto, 160) || !texto(datos.mensaje, 4000)) {
    return 'Mensaje inválido: revisa nombre, correo, teléfono, asunto y mensaje'
  }
  return null
}

router.post('/', limitarEnvios, async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  await MensajeContacto.create({
    nombre: req.body.nombre.trim(), correo: req.body.correo.trim().toLowerCase(),
    telefono: req.body.telefono.trim(), asunto: req.body.asunto.trim(),
    mensaje: req.body.mensaje.trim(),
  })
  res.status(201).json({ mensaje: 'Mensaje recibido' })
})

router.get('/', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const mensajes = await MensajeContacto.find().sort({ createdAt: -1 }).limit(100)
  res.json({ mensajes: mensajes.map((item) => ({
    id: item.id, nombre: item.nombre, correo: item.correo,
    telefono: item.telefono, asunto: item.asunto, mensaje: item.mensaje,
    creadoEn: item.createdAt,
  })) })
})

export default router
