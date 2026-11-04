import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  correo: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  hash: { type: String, required: true, match: /^[0-9a-f]{64}$/ },
  vence: { type: Date, required: true },
  intentos: { type: Number, default: 0, min: 0 },
  usado: { type: Boolean, default: false },
}, { timestamps: true })

schema.index({ correo: 1, createdAt: -1 })
schema.index({ vence: 1 }, { expireAfterSeconds: 86400 })

export default mongoose.model('CodigoCorreoSolicitud', schema, 'codigosCorreoSolicitud')
