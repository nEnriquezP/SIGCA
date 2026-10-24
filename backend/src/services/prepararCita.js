import Cita from '../models/Cita.js'
import Horario, { DIAS, ZONA_HORARIA } from '../models/Horario.js'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import Servicio from '../models/Servicio.js'
import Usuario from '../models/Usuario.js'

const formatoHora = /^([01]\d|2[0-3]):[0-5]\d$/
const formatoDia = /^\d{4}-\d{2}-\d{2}$/

export function errorCita(status, mensaje) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

export function fechaValida(valor) {
  if (typeof valor !== 'string' || !formatoDia.test(valor)) return false
  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
}

export function ahoraGuatemala(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora)
  const v = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return { fecha: `${v.year}-${v.month}-${v.day}`, hora: `${v.hour}:${v.minute}` }
}

function minutos(hora) {
  return Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5))
}

function horaDe(minuto) {
  return `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`
}

function esMenor(fechaNacimiento, fechaCita) {
  let edad = Number(fechaCita.slice(0, 4)) - Number(fechaNacimiento.slice(0, 4))
  if (fechaCita.slice(5) < fechaNacimiento.slice(5)) edad -= 1
  return edad < 18
}

// Esta función se reutilizará al incorporar la programación general de citas en la fase 7.
export async function prepararCita({ pacienteId, servicioId, profesionalId, fecha,
  horaInicio, session, ahora = new Date() }) {
  if (!fechaValida(fecha) || typeof horaInicio !== 'string' ||
      !formatoHora.test(horaInicio)) {
    throw errorCita(400, 'Fecha u hora de inicio inválida')
  }
  const actual = ahoraGuatemala(ahora)
  if (fecha < actual.fecha || (fecha === actual.fecha && horaInicio <= actual.hora)) {
    throw errorCita(400, 'La cita debe comenzar en una fecha y hora futuras de Guatemala')
  }

  const [paciente, servicio, profesional] = await Promise.all([
    Paciente.findOne({ _id: pacienteId, estado: 'ACTIVO' }, null, { session }),
    Servicio.findOne({ _id: servicioId, estado: 'ACTIVO' }, null, { session }),
    Usuario.findOne({ _id: profesionalId, rol: 'PROFESIONAL', activo: true }, null, { session }),
  ])
  if (!paciente) throw errorCita(409, 'El paciente no existe o está inactivo')
  if (!servicio) throw errorCita(409, 'El servicio ya no está activo')
  if (!profesional) throw errorCita(409, 'El profesional no existe o está inactivo')

  const duracionMinutos = servicio.duracionMinutos
  if (!Number.isInteger(duracionMinutos) || duracionMinutos < 1 || duracionMinutos > 1440 ||
      !Number.isSafeInteger(servicio.precioCentavos) || servicio.precioCentavos < 1) {
    throw errorCita(409, 'El servicio tiene duración o precio inválido')
  }
  const finEnMinutos = minutos(horaInicio) + duracionMinutos
  if (finEnMinutos >= 1440) throw errorCita(409, 'La cita debe terminar el mismo día')
  const horaFin = horaDe(finEnMinutos)
  const minutosOcupados = Array.from({ length: duracionMinutos },
    (_, indice) => minutos(horaInicio) + indice)

  const diaSemana = new Date(`${fecha}T12:00:00Z`).getUTCDay()
  const dia = DIAS[(diaSemana + 6) % 7]
  const horario = await Horario.findOne({ dia, activo: true }, null, { session })
  if (!horario || !horario.intervalos.some((intervalo) =>
    intervalo.horaInicio <= horaInicio && horaFin <= intervalo.horaFin)) {
    throw errorCita(409, 'La cita debe caber completa dentro de un intervalo de atención')
  }

  if (esMenor(paciente.fechaNacimiento, fecha)) {
    const responsables = paciente.responsables ?? []
    const valido = responsables.length && await Responsable.findOne(
      { _id: { $in: responsables } }, '_id', { session })
    if (!valido) throw errorCita(409, 'El paciente menor necesita un responsable registrado')
  }

  const traslape = await Cita.findOne({
    profesional: profesionalId, fecha,
    estado: { $nin: ['CANCELADA', 'COMPLETADA'] },
    horaInicio: { $lt: horaFin }, horaFin: { $gt: horaInicio },
  }, '_id', { session })
  if (traslape) throw errorCita(409, 'El profesional ya tiene una cita en ese intervalo')

  return { paciente: pacienteId, servicio: servicioId, profesional: profesionalId,
    fecha, horaInicio, horaFin, minutosOcupados, duracionMinutos,
    precioCentavos: servicio.precioCentavos, estado: 'PENDIENTE',
    observacionesAdministrativas: '' }
}
