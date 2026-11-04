import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  paciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
  servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Servicio', required: true },
  profesional: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  solicitudCita: { type: mongoose.Schema.Types.ObjectId, ref: 'SolicitudCita' },
  fecha: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  horaInicio: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  horaFin: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  minutosOcupados: { type: [Number], required: true,
    validate: (v) => Array.isArray(v) && v.length > 0 && v.length <= 1440 &&
      v.every((minuto) => Number.isInteger(minuto) && minuto >= 0 && minuto < 1440) },
  duracionMinutos: { type: Number, required: true, min: 1, max: 1440,
    validate: Number.isInteger },
  precioCentavos: { type: Number, required: true, min: 1, max: 3000000000,
    validate: Number.isSafeInteger },
  revisionFinanciera: { type: Number, default: 0, min: 0,
    validate: Number.isSafeInteger },
  estado: { type: String, enum: ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA'],
    default: 'PENDIENTE' },
  observacionesAdministrativas: { type: String, trim: true, default: '', maxlength: 2000 },
}, { timestamps: true })

schema.index({ profesional: 1, fecha: 1, horaInicio: 1, horaFin: 1 })
schema.index({ paciente: 1, fecha: -1, horaInicio: -1 })
schema.index({ fecha: 1, horaInicio: 1 })
schema.index({ solicitudCita: 1 }, { unique: true, sparse: true })
schema.index({ profesional: 1, fecha: 1, minutosOcupados: 1 }, {
  unique: true,
  partialFilterExpression: { estado: { $in: ['PENDIENTE', 'CONFIRMADA'] } },
})

export default mongoose.model('Cita', schema)
