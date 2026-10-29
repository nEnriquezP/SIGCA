import mongoose from 'mongoose'

const rolSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, immutable: true,
    match: /^ROL_[A-Z0-9_]{2,40}$/ },
  nombre: { type: String, required: true, trim: true, maxlength: 60 },
  permisos: { type: [String], default: [] },
}, { timestamps: true })

export default mongoose.model('Rol', rolSchema)
