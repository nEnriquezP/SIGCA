import mongoose from 'mongoose'

const schema = new mongoose.Schema({
  codigo: { type: String, immutable: true, match: /^CAJ-\d{4,}$/ },
  usuarioResponsable: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario',
    required: true, immutable: true },
  fechaOperativa: { type: String, required: true, immutable: true,
    match: /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/ },
  estado: { type: String, enum: ['ABIERTA', 'CERRADA'], default: 'ABIERTA' },
  abiertaEn: { type: Date, required: true, default: Date.now, immutable: true },
  montoInicialCentavos: { type: Number, required: true, min: 0,
    validate: Number.isSafeInteger, immutable: true },
  cerradaEn: { type: Date, default: null },
  cerradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  revisionMovimientos: { type: Number, default: 0, min: 0,
    validate: Number.isSafeInteger },
  totalEfectivoCentavos: { type: Number, default: null, min: 0, validate: (v) => v === null || Number.isSafeInteger(v) },
  totalTransferenciaCentavos: { type: Number, default: null, min: 0, validate: (v) => v === null || Number.isSafeInteger(v) },
  totalTarjetaCentavos: { type: Number, default: null, min: 0, validate: (v) => v === null || Number.isSafeInteger(v) },
  totalIngresosCentavos: { type: Number, default: null, min: 0, validate: (v) => v === null || Number.isSafeInteger(v) },
  efectivoEsperadoCentavos: { type: Number, default: null, min: 0, validate: (v) => v === null || Number.isSafeInteger(v) },
  efectivoContadoCentavos: { type: Number, default: null, min: 0, validate: (v) => v === null || Number.isSafeInteger(v) },
  diferenciaCentavos: { type: Number, default: null, validate: (v) => v === null || Number.isSafeInteger(v) },
})

schema.index({ usuarioResponsable: 1 }, { unique: true,
  partialFilterExpression: { estado: 'ABIERTA' }, name: 'una_caja_abierta_por_usuario' })
schema.index({ codigo: 1 }, { unique: true,
  partialFilterExpression: { codigo: { $type: 'string' } } })

export default mongoose.model('Caja', schema, 'cajas')
