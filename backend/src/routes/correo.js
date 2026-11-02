import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import { autenticar } from '../middleware/autenticacion.js'
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

router.post('/reenviar', autenticar, limite, async (req, res) => {
  if (req.usuario.rol !== 'ADMINISTRADOR') {
    return res.status(403).json({ mensaje: 'Solo un administrador puede reenviar enlaces de verificación' })
  }
  const tipo = req.body?.tipo
  const id = req.body?.id
  if (!Object.hasOwn(modelos, tipo) || typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
    return res.status(400).json({ mensaje: 'Solicitud inválida' })
  }
  const persona = await modelos[tipo].findOne({ _id: id, correoVerificado: { $ne: true } })
  if (!persona || !persona.correo) {
    return res.status(400).json({ mensaje: 'Este registro no tiene un correo pendiente de verificación' })
  }
  if (!await emitirEnlace(tipo, persona, 'VERIFICAR')) {
    return res.status(503).json({ mensaje: 'No se pudo enviar el enlace. Intenta de nuevo más tarde.' })
  }
  res.json({ mensaje: 'Se envió un nuevo enlace de verificación.' })
})

export default router
