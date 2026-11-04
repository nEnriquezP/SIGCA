import mongoose from 'mongoose'
import Pago from '../models/Pago.js'

export function errorFinanciero(status, mensaje) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

export function esConflictoFinanciero(error) {
  return error?.code === 11000 || error?.code === 112 ||
    error?.hasErrorLabel?.('TransientTransactionError') === true
}

export function centavosSeguros(valor, admiteCero = false) {
  return Number.isSafeInteger(valor) && (admiteCero ? valor >= 0 : valor > 0)
}

export function sumarCentavos(a, b) {
  const total = a + b
  if (!Number.isSafeInteger(total)) throw errorFinanciero(409, 'Total fuera del rango seguro')
  return total
}

export async function totalPagadoCita(citaId, session) {
  const consulta = Pago.aggregate([
    { $match: { cita: new mongoose.Types.ObjectId(citaId), estado: 'REGISTRADO' } },
    { $group: { _id: null, total: { $sum: '$montoCentavos' } } },
  ])
  if (session) consulta.session(session)
  const filas = await consulta
  const total = filas[0]?.total ?? 0
  if (!centavosSeguros(total, true)) throw errorFinanciero(409, 'Total fuera del rango seguro')
  return total
}

export async function resumenSaldoCita(cita, session) {
  const totalPagadoCentavos = await totalPagadoCita(cita.id, session)
  if (!centavosSeguros(cita.precioCentavos) || totalPagadoCentavos > cita.precioCentavos) {
    throw errorFinanciero(409, 'Los importes de la cita requieren revisión')
  }
  const saldoPendienteCentavos = cita.precioCentavos - totalPagadoCentavos
  return { cita: cita.id, precioCentavos: cita.precioCentavos, totalPagadoCentavos,
    saldoPendienteCentavos, estadoFinanciero: totalPagadoCentavos === 0 ? 'PENDIENTE' :
      saldoPendienteCentavos === 0 ? 'PAGADO' : 'PARCIAL' }
}

export async function totalesCaja(cajaId, session) {
  const filas = await Pago.aggregate([
    { $match: { caja: new mongoose.Types.ObjectId(cajaId), estado: 'REGISTRADO' } },
    { $group: { _id: '$metodo', total: { $sum: '$montoCentavos' } } },
  ]).session(session)
  const totales = { EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA: 0 }
  for (const fila of filas) {
    if (!Object.hasOwn(totales, fila._id) || !centavosSeguros(fila.total, true)) {
      throw errorFinanciero(409, 'Movimientos de caja inválidos')
    }
    totales[fila._id] = fila.total
  }
  return totales
}
