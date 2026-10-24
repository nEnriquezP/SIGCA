import mongoose from 'mongoose'

export const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO']
export const ZONA_HORARIA = 'America/Guatemala'

const intervaloSchema = new mongoose.Schema({
  horaInicio: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  horaFin: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
}, { _id: false })

const horarioSchema = new mongoose.Schema({
  dia: { type: String, required: true, enum: DIAS, unique: true },
  activo: { type: Boolean, required: true },
  intervalos: { type: [intervaloSchema], default: [] },
}, { timestamps: true })

export default mongoose.model('Horario', horarioSchema)
