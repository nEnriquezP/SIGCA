import mongoose from 'mongoose'

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 120 },
  correo: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
  },
  passwordHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, default: 0, select: false },
  rol: {
    type: String,
    required: true,
    enum: ['ADMINISTRADOR', 'RECEPCIONISTA', 'PROFESIONAL'],
  },
  activo: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Usuario', usuarioSchema)
