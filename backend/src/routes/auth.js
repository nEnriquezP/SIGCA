import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { rateLimit } from 'express-rate-limit'
import Usuario from '../models/Usuario.js'
import { autenticar, crearToken } from '../middleware/autenticacion.js'

const router = Router()
const limitarIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
})

function datosPublicos(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
  }
}

router.post('/login', limitarIntentos, async (req, res) => {
  const { correo, password } = req.body ?? {}
  if (typeof correo !== 'string' || typeof password !== 'string' ||
      !correo.trim() || !password || correo.length > 254 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ mensaje: 'Correo y contraseña válidos son obligatorios' })
  }

  const usuario = await Usuario.findOne({ correo: correo.trim().toLowerCase() })
    .select('+passwordHash')
  const valido = usuario && await bcrypt.compare(password, usuario.passwordHash)
  if (!valido || !usuario.activo) {
    return res.status(401).json({ mensaje: 'Credenciales incorrectas' })
  }

  res.json({ token: crearToken(usuario), usuario: datosPublicos(usuario) })
})

router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: datosPublicos(req.usuario) })
})

export default router
