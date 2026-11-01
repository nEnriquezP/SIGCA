import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  clave: { type: String, required: true, unique: true },
  destinatario: { type: String, required: true },
  asunto: { type: String, required: true },
  texto: { type: String, required: true },
  programado: { type: Date, required: true },
  estado: { type: String, enum: ['PENDIENTE', 'ENVIANDO', 'ENVIADO'], default: 'PENDIENTE' },
  intentos: { type: Number, default: 0 },
  bloqueoHasta: { type: Date },
  enviadoEn: { type: Date },
}, { timestamps: true })

schema.index({ estado: 1, programado: 1 })
export default mongoose.model('AvisoCorreo', schema)
