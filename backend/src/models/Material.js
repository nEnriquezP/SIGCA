import mongoose from 'mongoose'

export function enlaceMaterialValido(valor) {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > 500 ||
      /[\s\\\u0000-\u001f\u007f]/.test(valor)) return false
  const enlace = valor.trim()
  if (enlace.startsWith('/')) return !enlace.startsWith('//')
  try {
    const url = new URL(enlace)
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) &&
      !url.username && !url.password
  } catch {
    return false
  }
}

const schema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true, maxlength: 160 },
  descripcion: { type: String, required: true, trim: true, maxlength: 4000 },
  tipo: { type: String, required: true, trim: true, maxlength: 80 },
  enlace: { type: String, required: true, trim: true, validate: enlaceMaterialValido },
  estado: { type: String, enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' },
}, { timestamps: { createdAt: 'fechaRegistro', updatedAt: 'fechaActualizacion' } })

schema.index({ estado: 1, fechaRegistro: -1 })

export default mongoose.model('Material', schema, 'materiales')
