import mongoose from 'mongoose'
import { imagenValida } from './Servicio.js'

const contenidoSchema = new mongoose.Schema({
  clave: { type: String, required: true, unique: true, enum: ['principal'] },
  nombreCentro: { type: String, required: true, trim: true, maxlength: 120 },
  logo: { type: String, trim: true, default: '', validate: (v) => !v || imagenValida(v) },
  informacionPrincipal: { type: String, required: true, trim: true, maxlength: 2000 },
  mision: { type: String, required: true, trim: true, maxlength: 2000 },
  vision: { type: String, required: true, trim: true, maxlength: 2000 },
  carrusel: { type: [String], default: [], validate: (v) =>
    (v.length === 0 || (v.length >= 5 && v.length <= 10)) && v.every(imagenValida) },
  contacto: {
    correo: { type: String, required: true, trim: true, maxlength: 254 },
    telefono: { type: String, required: true, trim: true, maxlength: 30 },
    direccion: { type: String, required: true, trim: true, maxlength: 300 },
  },
}, { timestamps: true })

export default mongoose.model('ContenidoInstitucional', contenidoSchema, 'contenidoInstitucional')
