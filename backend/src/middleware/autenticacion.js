import jwt from 'jsonwebtoken'
import Usuario from '../models/Usuario.js'

function obtenerSecreto() {
  const secreto = process.env.JWT_SECRET
  if (!secreto || secreto.length < 32) {
    const error = new Error('Autenticación no configurada')
    error.status = 503
    throw error
  }
  return secreto
}

export function crearToken(usuario) {
  return jwt.sign({ version: usuario.tokenVersion ?? 0 }, obtenerSecreto(), {
    algorithm: 'HS256',
    subject: usuario.id,
    issuer: 'sigca',
    audience: 'sigca-web',
    expiresIn: '8h',
  })
}

export async function autenticar(req, res, next) {
  const autorizacion = req.get('authorization') ?? ''
  const coincidencia = /^Bearer ([^\s]+)$/.exec(autorizacion)

  if (!coincidencia) {
    return res.status(401).json({ mensaje: 'Se requiere iniciar sesión' })
  }

  let datos
  try {
    datos = jwt.verify(coincidencia[1], obtenerSecreto(), {
      algorithms: ['HS256'],
      issuer: 'sigca',
      audience: 'sigca-web',
    })
  } catch (error) {
    if (error.status === 503) return next(error)
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' })
  }

  if (!mongooseIdValido(datos.sub)) {
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' })
  }

  const usuario = await Usuario.findById(datos.sub).select('+tokenVersion')
  if (!usuario || !usuario.activo || datos.version !== (usuario.tokenVersion ?? 0)) {
    return res.status(401).json({ mensaje: 'Sesión inválida o vencida' })
  }

  req.usuario = usuario
  next()
}

function mongooseIdValido(valor) {
  return typeof valor === 'string' && /^[\da-f]{24}$/i.test(valor)
}

export function permitirRoles(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ mensaje: 'Se requiere iniciar sesión' })
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ mensaje: 'Acceso no permitido' })
    }
    next()
  }
}
