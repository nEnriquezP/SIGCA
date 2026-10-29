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
  rol: { type: String, required: true, maxlength: 44 },
  avatar: { type: String, enum: ['', 'medica', 'medico', 'enfermera', 'enfermero',
    'recepcionista-mujer', 'recepcionista-hombre'], default: '' },
  fotografia: { type: String, default: '', maxlength: 500,
    validate: (valor) => !valor || /^\/api\/imagenes\/privadas\/[0-9a-f-]{36}$/.test(valor) },
  activo: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Usuario', usuarioSchema)
