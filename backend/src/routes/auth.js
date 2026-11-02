import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { createHash } from 'node:crypto'
import Usuario from '../models/Usuario.js'
import ImagenCargada from '../models/ImagenCargada.js'
import { autenticar, crearToken } from '../middleware/autenticacion.js'
import { passwordNuevaValida, REGLA_PASSWORD } from '../services/validacionCuenta.js'
import { permisosDeUsuario } from '../services/permisos.js'
import { consumirEnlace, emitirEnlace } from '../services/correo.js'

function esperaReal(req, etiqueta) {
  const vencimiento = new Date(req.rateLimit?.resetTime).getTime()
  const minutos = Number.isFinite(vencimiento) ? Math.max(1, Math.ceil((vencimiento - Date.now()) / 60000)) : 15
  return { mensaje: `${etiqueta} Intenta de nuevo en ${minutos} minuto(s).` }
}

const router = Router()
const limitarIntentos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : ''
    const cuenta = createHash('sha256').update(correo).digest('hex').slice(0, 24)
    return `${ipKeyGenerator(req.ip)}:${cuenta}`
  },
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: (req) => esperaReal(req, 'Demasiados intentos para esta cuenta.'),
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
    correoVerificado: usuario.correoVerificado === true,
    verificacionPendiente: usuario.verificacionPendiente === true,
    debeCambiarPassword: usuario.debeCambiarPassword === true,
    recibirPublicaciones: usuario.recibirPublicaciones === true,
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
  if (usuario.verificacionPendiente === true) {
    return res.status(403).json({ mensaje: 'Verifica tu correo antes de ingresar. Solicita al administrador que reenvíe el enlace.' })
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

router.put('/preferencias-correo', autenticar, async (req, res) => {
  if (typeof req.body?.recibirPublicaciones !== 'boolean' ||
      Object.keys(req.body).length !== 1) {
    return res.status(400).json({ mensaje: 'Preferencia de correo inválida' })
  }
  req.usuario.recibirPublicaciones = req.body.recibirPublicaciones
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
  usuario.debeCambiarPassword = false
  usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1
  await usuario.save()
  res.json({ mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' })
})

const limitarCorreos = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: (req) => esperaReal(req, 'Demasiadas solicitudes de correo.') })

router.post('/recuperar', limitarCorreos, async (req, res) => {
  const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : ''
  if (correo && correo.length <= 254) {
    const usuario = await Usuario.findOne({ correo, activo: true, correoVerificado: true })
    if (usuario) await emitirEnlace('USUARIO', usuario, 'RECUPERAR')
  }
  res.json({ mensaje: 'Si existe una cuenta verificada, enviaremos un enlace a ese correo.' })
})

router.post('/restablecer', limitarCorreos, async (req, res) => {
  if (!passwordNuevaValida(req.body?.passwordNueva)) {
    return res.status(400).json({ mensaje: REGLA_PASSWORD })
  }
  const resultado = await consumirEnlace(req.body?.token, 'RECUPERAR')
  if (!resultado || resultado.token.tipo !== 'USUARIO') {
    return res.status(400).json({ mensaje: 'Enlace vencido o ya utilizado' })
  }
  const usuario = await Usuario.findById(resultado.entidad.id).select('+passwordHash +tokenVersion')
  usuario.passwordHash = await bcrypt.hash(req.body.passwordNueva, 12)
  usuario.debeCambiarPassword = false
  usuario.tokenVersion = (usuario.tokenVersion ?? 0) + 1
  await usuario.save()
  res.json({ mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' })
})

export default router
