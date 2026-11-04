import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  numeroComprobante: { type: String, required: true, unique: true, immutable: true,
    match: /^PAG-\d{6,}$/ },
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true,
    immutable: true },
  cita: { type: mongoose.Schema.Types.ObjectId, ref: 'Cita', required: true,
    immutable: true },
  caja: { type: mongoose.Schema.Types.ObjectId, ref: 'Caja', required: true,
    immutable: true },
  montoCentavos: { type: Number, required: true, min: 1,
    validate: Number.isSafeInteger, immutable: true },
  metodo: { type: String, required: true, immutable: true,
    enum: ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA'] },
  fechaPago: { type: Date, required: true, default: Date.now, immutable: true },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true,
    immutable: true },
  estado: { type: String, enum: ['REGISTRADO', 'ANULADO'], default: 'REGISTRADO' },
  motivoAnulacion: { type: String, default: null },
  fechaAnulacion: { type: Date, default: null },
  anuladoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  solicitudId: { type: String, required: true, unique: true, immutable: true,
    match: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i },
})

schema.index({ cita: 1, estado: 1 })
schema.index({ caja: 1, estado: 1, metodo: 1 })

export default mongoose.model('Pago', schema)
