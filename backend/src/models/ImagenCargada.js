import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  _id: { type: String, required: true },
  categoria: { type: String, required: true,
    enum: ['paciente', 'responsable', 'servicio', 'logo', 'carrusel', 'publicacion', 'actividad'] },
  publicId: { type: String, required: true },
  valor: { type: String, required: true, maxlength: 500 },
  privada: { type: Boolean, required: true },
}, { timestamps: true })

export default mongoose.model('ImagenCargada', schema)
