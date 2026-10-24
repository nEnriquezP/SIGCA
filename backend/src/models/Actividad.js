import mongoose from 'mongoose'
import { imagenValida } from './Servicio.js'

const schema = new mongoose.Schema({
  tipo: { type: String, required: true, enum: ['CAPACITACION', 'ESCUELA_PADRES', 'OTRA'] },
  titulo: { type: String, required: true, trim: true, maxlength: 160 },
  descripcion: { type: String, required: true, trim: true, maxlength: 4000 },
  imagenes: { type: [String], default: [], validate: (v) =>
    v.length <= 10 && v.every(imagenValida) },
  activo: { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('Actividad', schema)
