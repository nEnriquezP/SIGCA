import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { rateLimit } from 'express-rate-limit'
import Usuario from '../models/Usuario.js'
import ImagenCargada from '../models/ImagenCargada.js'
import { autenticar, crearToken } from '../middleware/autenticacion.js'
import { passwordNuevaValida, REGLA_PASSWORD } from '../services/validacionCuenta.js'
import { permisosDeUsuario } from '../services/permisos.js'

const router = Router()
const limitarIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos. Intenta de nuevo en 15 minutos.' },
})

function datosPublicos(usuario, permisos) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol: usuario.rol,
    avatar: usuario.avatar || '',
    fotografia: usuario.fotografia || '',
    permisos,
  }
}

router.post('/login', limitarIntentos, async (req, res) => {
  const { correo, password } = req.body ?? {}
  if (typeof correo !== 'string' || typeof password !== 'string' ||
      !correo.trim() || !password || correo.length > 254 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ mensaje: 'Correo y contraseña válidos son obligatorios' })
  }

  const usuario = await Usuario.findOne({ correo: correo.trim().toLowerCase() })
    .select('+passwordHash +tokenVersion')
  const valido = usuario && await bcrypt.compare(password, usuario.passwordHash)
  if (!valido || !usuario.activo) {
    return res.status(401).json({ mensaje: 'Credenciales incorrectas' })
  }

  res.json({ token: crearToken(usuario), usuario: datosPublicos(usuario,
    await permisosDeUsuario(usuario)) })
})

router.get('/me', autenticar, (req, res) => {
  res.json({ usuario: datosPublicos(req.usuario, [...req.permisos]) })
})

const avatares = new Set(['', 'medica', 'medico', 'enfermera', 'enfermero',
  'recepcionista-mujer', 'recepcionista-hombre'])

router.put('/perfil', autenticar, async (req, res) => {
  const datos = req.body
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 || !('avatar' in datos) || !('fotografia' in datos) ||
      typeof datos.avatar !== 'string' || !avatares.has(datos.avatar) ||
      typeof datos.fotografia !== 'string' || (datos.avatar && datos.fotografia)) {
    return res.status(400).json({ mensaje: 'Elige una fotografía o un avatar válido' })
  }
  const fotografia = datos.fotografia
  if (fotografia && fotografia !== req.usuario.fotografia &&
      (!/^\/api\/imagenes\/privadas\/[0-9a-f-]{36}$/.test(fotografia) ||
        !await ImagenCargada.exists({ valor: fotografia, categoria: 'usuario', privada: true,
          propietario: req.usuario._id }))) {
    return res.status(400).json({ mensaje: 'La fotografía no pertenece a tu cuenta' })
  }
  req.usuario.avatar = datos.avatar
  req.usuario.fotografia = fotografia
  await req.usuario.save()
  res.json({ usuario: datosPublicos(req.usuario, [...req.permisos]) })
})

router.put('/password', autenticar, async (req, res) => {
  const datos = req.body
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 || !('passwordActual' in datos) ||
      !('passwordNueva' in datos) || !passwordNuevaValida(datos.passwordNueva) ||
      typeof datos.passwordActual !== 'string' ||
      Buffer.byteLength(datos.passwordActual, 'utf8') > 72) {
    return res.status(400).json({ mensaje: REGLA_PASSWORD })
  }

  const usuario = await Usuario.findById(req.usuario.id).select('+passwordHash +tokenVersion')
  if (!usuario || !usuario.activo) {
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' })
  }
  if (!await bcrypt.compare(datos.passwordActual, usuario.passwordHash)) {
    return res.status(403).json({ mensaje: 'Contraseña actual incorrecta' })
  }
  if (await bcrypt.compare(datos.passwordNueva, usuario.passwordHash)) {
    return res.status(400).json({ mensaje: 'La nueva contraseña debe ser diferente' })
  }

  usuario.passwordHash = await bcrypt.hash(datos.passwordNueva, 12)
  usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1
  await usuario.save()
  res.json({ mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' })
})

export default router
