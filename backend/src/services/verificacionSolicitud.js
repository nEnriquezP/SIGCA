import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const MINUTOS_CODIGO_SOLICITUD = 10
export const MAX_INTENTOS_CODIGO_SOLICITUD = 5

export function generarCodigoSolicitudCorreo() {
  return String(randomInt(0, 1000000)).padStart(6, '0')
}

export function hashCodigoSolicitudCorreo(id, correo, codigo) {
  const secreto = process.env.JWT_SECRET
  if (typeof secreto !== 'string' || secreto.length < 32) {
    throw new Error('La verificación de solicitudes no está configurada')
  }
  return createHmac('sha256', secreto)
    .update(`${String(id)}:${correo.toLowerCase()}:${codigo}`).digest('hex')
}

export function codigoSolicitudCorreoCoincide(hashEsperado, id, correo, codigo) {
  if (typeof hashEsperado !== 'string' || !/^[0-9a-f]{64}$/.test(hashEsperado) ||
      typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) return false
  const calculado = hashCodigoSolicitudCorreo(id, correo, codigo)
  return timingSafeEqual(Buffer.from(hashEsperado, 'hex'), Buffer.from(calculado, 'hex'))
}
