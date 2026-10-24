import mongoose from 'mongoose'

export function imagenValida(valor) {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > 500 ||
      /\s|\\/.test(valor)) return false
  const imagen = valor.trim()
  if (imagen.startsWith('/')) return !imagen.startsWith('//')
  try {
    const url = new URL(imagen)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) &&
      !url.username && !url.password
  } catch {
    return false
  }
}

const servicioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 120 },
  descripcion: { type: String, required: true, trim: true, maxlength: 2000 },
  duracionMinutos: { type: Number, required: true, min: 1, max: 1440,
    validate: Number.isInteger },
  precioCentavos: { type: Number, required: true, min: 1, max: 100000000,
    validate: Number.isSafeInteger },
  imagen: { type: String, required: true, trim: true, validate: imagenValida },
  estado: { type: String, enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' },
}, { timestamps: true })

export default mongoose.model('Servicio', servicioSchema)
