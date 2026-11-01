import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import Usuario from '../models/Usuario.js'
import { consumirEnlace, emitirEnlace } from '../services/correo.js'

const router = Router()
const modelos = { PACIENTE: Paciente, RESPONSABLE: Responsable, USUARIO: Usuario }
const limite = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: (req) => ({ mensaje: `Demasiadas solicitudes. Intenta de nuevo en ${Math.max(1,
    Math.ceil((new Date(req.rateLimit?.resetTime).getTime() - Date.now()) / 60000))} minuto(s).` }) })

router.post('/verificar', limite, async (req, res) => {
  const resultado = await consumirEnlace(req.body?.token, 'VERIFICAR')
  if (!resultado) return res.status(400).json({ mensaje: 'Enlace vencido o ya utilizado' })
  resultado.entidad.correoVerificado = true
  if (resultado.token.tipo === 'USUARIO') resultado.entidad.verificacionPendiente = false
  await resultado.entidad.save()
  res.json({ mensaje: 'Correo verificado correctamente' })
})

router.post('/reenviar', limite, async (req, res) => {
  const tipo = req.body?.tipo
  const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : ''
  if (!modelos[tipo] || !correo || correo.length > 254) {
    return res.status(400).json({ mensaje: 'Solicitud inválida' })
  }
  const personas = await modelos[tipo].find({ correo, correoVerificado: { $ne: true } }).limit(10)
  for (const persona of personas) await emitirEnlace(tipo, persona, 'VERIFICAR')
  res.json({ mensaje: 'Si el correo está pendiente, enviaremos un nuevo enlace.' })
})

export default router
