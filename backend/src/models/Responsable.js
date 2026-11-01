import mongoose from 'mongoose'

const responsableSchema = new mongoose.Schema({
  codigo: { type: String, required: true, immutable: true, match: /^RESPO-\d{6,}$/ },
  fotografia: { type: String, required: true, trim: true, maxlength: 500 },
  nombres: { type: String, required: true, trim: true, maxlength: 120 },
  apellidos: { type: String, required: true, trim: true, maxlength: 120 },
  parentesco: { type: String, required: true, trim: true, maxlength: 80 },
  telefono: { type: String, required: true, trim: true, maxlength: 30 },
  correo: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  correoVerificado: { type: Boolean, default: false },
  recibirPublicaciones: { type: Boolean, default: false },
  direccion: { type: String, required: true, trim: true, maxlength: 300 },
}, { timestamps: true })

responsableSchema.index({ codigo: 1 }, { unique: true,
  partialFilterExpression: { codigo: { $type: 'string' } } })

export default mongoose.model('Responsable', responsableSchema)
