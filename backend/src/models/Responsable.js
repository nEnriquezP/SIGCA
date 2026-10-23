import mongoose from 'mongoose'

const responsableSchema = new mongoose.Schema({
  fotografia: { type: String, required: true, trim: true, maxlength: 500 },
  nombres: { type: String, required: true, trim: true, maxlength: 120 },
  apellidos: { type: String, required: true, trim: true, maxlength: 120 },
  parentesco: { type: String, required: true, trim: true, maxlength: 80 },
  telefono: { type: String, required: true, trim: true, maxlength: 30 },
  correo: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  direccion: { type: String, required: true, trim: true, maxlength: 300 },
}, { timestamps: true })

export default mongoose.model('Responsable', responsableSchema)
