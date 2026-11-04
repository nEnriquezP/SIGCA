import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  codigo: { type: String, immutable: true, match: /^CONS-CITA-[0-9A-F]{5,24}$/ },
  nombreSolicitante: { type: String, required: true, trim: true, maxlength: 120 },
  correo: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  correoVerificado: { type: Boolean, default: false },
  recibirPublicaciones: { type: Boolean, default: false },
  telefono: { type: String, required: true, trim: true, maxlength: 30 },
  servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Servicio', required: true },
  fechaPreferida: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  mensajeAdicional: { type: String, trim: true, default: '', maxlength: 2000 },
  estado: { type: String, enum: ['PENDIENTE', 'ATENDIDA', 'RECHAZADA'], default: 'PENDIENTE' },
  cita: { type: mongoose.Schema.Types.ObjectId, ref: 'Cita', default: null },
}, { timestamps: true })

schema.index({ estado: 1, createdAt: -1 })
schema.index({ codigo: 1 }, { unique: true,
  partialFilterExpression: { codigo: { $type: 'string' } } })

export default mongoose.model('SolicitudCita', schema, 'solicitudesCita')
