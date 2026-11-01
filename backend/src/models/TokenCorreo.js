import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  hash: { type: String, required: true, unique: true },
  tipo: { type: String, required: true, enum: ['PACIENTE', 'RESPONSABLE', 'USUARIO'] },
  entidad: { type: mongoose.Schema.Types.ObjectId, required: true },
  correo: { type: String, required: true },
  proposito: { type: String, required: true, enum: ['VERIFICAR', 'RECUPERAR'] },
  vence: { type: Date, required: true },
  usado: { type: Boolean, default: false },
}, { timestamps: true })

schema.index({ vence: 1 }, { expireAfterSeconds: 86400 })
schema.index({ tipo: 1, entidad: 1, proposito: 1 })

export default mongoose.model('TokenCorreo', schema)
