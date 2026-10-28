import mongoose from 'mongoose'

const contadorSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  secuencia: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
})

export default mongoose.model('Contador', contadorSchema)
