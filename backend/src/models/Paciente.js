import mongoose from 'mongoose'

function fechaCalendarioValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
}

const pacienteSchema = new mongoose.Schema({
  codigo: { type: String, required: true, immutable: true, match: /^PAC-\d{6,}$/ },
  fotografia: { type: String, required: true, trim: true, maxlength: 500 },
  nombres: { type: String, required: true, trim: true, maxlength: 120 },
  apellidos: { type: String, required: true, trim: true, maxlength: 120 },
  fechaNacimiento: { type: String, required: true, validate: fechaCalendarioValida },
  sexo: {
    type: String,
    required: true,
    enum: ['FEMENINO', 'MASCULINO', 'OTRO', 'PREFIERE_NO_DECIR'],
  },
  telefono: { type: String, required: true, trim: true, maxlength: 30 },
  correo: { type: String, lowercase: true, trim: true, maxlength: 254, default: '' },
  correoVerificado: { type: Boolean, default: false },
  recibirPublicaciones: { type: Boolean, default: false },
  direccion: { type: String, required: true, trim: true, maxlength: 300 },
  fechaInicioProceso: { type: String, required: true, validate: fechaCalendarioValida },
  observacionesAdministrativas: { type: String, default: '', trim: true, maxlength: 2000 },
  estado: { type: String, enum: ['ACTIVO', 'INACTIVO'], default: 'ACTIVO' },
  responsables: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Responsable' }],
}, { timestamps: true })

pacienteSchema.index({ codigo: 1 }, { unique: true,
  partialFilterExpression: { codigo: { $type: 'string' } } })

export default mongoose.model('Paciente', pacienteSchema)
