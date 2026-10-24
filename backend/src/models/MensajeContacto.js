import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 120 },
  correo: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  telefono: { type: String, required: true, trim: true, maxlength: 30 },
  asunto: { type: String, required: true, trim: true, maxlength: 160 },
  mensaje: { type: String, required: true, trim: true, maxlength: 4000 },
}, { timestamps: true })

export default mongoose.model('MensajeContacto', schema, 'mensajesContacto')
