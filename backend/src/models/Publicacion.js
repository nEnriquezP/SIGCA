import mongoose from 'mongoose'
import { imagenValida } from './Servicio.js'

const schema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true, maxlength: 160 },
  descripcion: { type: String, required: true, trim: true, maxlength: 4000 },
  fechaPublicacion: { type: String, required: true },
  imagen: { type: String, trim: true, default: '', validate: (v) => !v || imagenValida(v) },
  enlace: { type: String, trim: true, default: '' },
  activo: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Publicacion', schema)
