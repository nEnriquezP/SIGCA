import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  material: { type: mongoose.Schema.Types.ObjectId, ref: 'Material', required: true },
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
  asignadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  fechaAsignacion: { type: Date, required: true, default: Date.now, immutable: true },
})

schema.index({ paciente: 1, fechaAsignacion: -1, _id: -1 })

export default mongoose.model('AsignacionMaterial', schema, 'asignacionesMateriales')
