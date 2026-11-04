import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar } from '../middleware/autenticacion.js'
import Caja from '../models/Caja.js'
import Cita from '../models/Cita.js'
import Contador from '../models/Contador.js'
import Pago from '../models/Pago.js'
import { siguienteComprobantePago } from '../services/comprobantesPago.js'
import { centavosSeguros, errorFinanciero, esConflictoFinanciero,
  sumarCentavos, totalPagadoCita } from '../services/finanzas.js'

const router = Router()
const rolesPago = ['ADMINISTRADOR', 'RECEPCIONISTA']
const metodos = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA']
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respuestaPago(pago, { auditoria = false, incluirSolicitud = false } = {}) {
  const paciente = pago.paciente
  const cita = pago.cita
  return { id: pago.id, numeroComprobante: pago.numeroComprobante,
    paciente: String(paciente?._id ?? paciente),
    pacienteCodigo: paciente?.codigo ?? null,
    pacienteNombre: paciente?.nombres ? `${paciente.nombres} ${paciente.apellidos}`.trim() : null,
    cita: String(cita?._id ?? cita), citaFecha: cita?.fecha ?? null,
    caja: String(pago.caja),
    montoCentavos: pago.montoCentavos, metodo: pago.metodo, fechaPago: pago.fechaPago,
    registradoPor: String(pago.registradoPor), estado: pago.estado,
    ...(incluirSolicitud ? { solicitudId: pago.solicitudId } : {}),
    ...(auditoria && pago.estado === 'ANULADO' ? {
      motivoAnulacion: pago.motivoAnulacion, fechaAnulacion: pago.fechaAnulacion,
      anuladoPor: pago.anuladoPor ? String(pago.anuladoPor) : null,
    } : {}) }
}

function autorizar(permiso, roles = rolesPago) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol) || !req.permisos.has(permiso)) {
      return res.status(403).json({ mensaje: 'Acceso no permitido' })
    }
    next()
  }
}

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00.000Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

function poblarPago(consulta) {
  return consulta.populate('paciente', 'codigo nombres apellidos')
    .populate('cita', 'fecha')
}

function mismoIntento(pago, datos, usuarioId) {
  return String(pago.registradoPor) === String(usuarioId) &&
    String(pago.cita) === datos.cita && pago.montoCentavos === datos.montoCentavos &&
    pago.metodo === datos.metodo
}

router.use(autenticar, (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

router.get('/', autorizar('PAGOS_VER'), async (req, res) => {
  const { paciente, fecha, metodo, pagina = '0' } = req.query
  if (Object.keys(req.query).some((campo) => !['paciente', 'fecha', 'metodo', 'pagina'].includes(campo)) ||
      (paciente !== undefined && (typeof paciente !== 'string' || !mongoose.isValidObjectId(paciente))) ||
      (fecha !== undefined && !fechaValida(fecha)) ||
      (metodo !== undefined && (typeof metodo !== 'string' || !metodos.includes(metodo))) ||
      typeof pagina !== 'string' || !/^(0|[1-9]\d{0,3})$/.test(pagina)) {
    return res.status(400).json({ mensaje: 'Filtros de pagos inválidos' })
  }
  const filtro = {}
  if (paciente) filtro.paciente = paciente
  if (metodo) filtro.metodo = metodo
  if (fecha) {
    const inicio = new Date(`${fecha}T00:00:00-06:00`)
    filtro.fechaPago = { $gte: inicio, $lt: new Date(inicio.getTime() + 86400000) }
  }
  const numeroPagina = Number(pagina)
  const [pagos, total] = await Promise.all([
    poblarPago(Pago.find(filtro).sort({ fechaPago: -1, _id: -1 })
      .skip(numeroPagina * 50).limit(50)),
    Pago.countDocuments(filtro),
  ])
  res.json({ pagos: pagos.map((pago) => respuestaPago(pago, {
    auditoria: req.usuario.rol === 'ADMINISTRADOR' })),
  total, pagina: numeroPagina, hayMas: (numeroPagina + 1) * 50 < total })
})

router.get('/:id', autorizar('PAGOS_VER'), async (req, res) => {
  if (Object.keys(req.query).length || !mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const pago = await poblarPago(Pago.findById(req.params.id))
  if (!pago) return res.status(404).json({ mensaje: 'Pago no encontrado' })
  res.json({ pago: respuestaPago(pago, { auditoria: req.usuario.rol === 'ADMINISTRADOR' }) })
})

router.post('/', autorizar('PAGOS_REGISTRAR'), async (req, res) => {
  const datos = req.body
  if (Object.keys(req.query).length || !datos || typeof datos !== 'object' ||
      Array.isArray(datos) || Object.keys(datos).length !== 4 ||
      !['cita', 'montoCentavos', 'metodo', 'solicitudId'].every((campo) =>
        Object.hasOwn(datos, campo)) ||
      typeof datos.cita !== 'string' || !mongoose.isValidObjectId(datos.cita) ||
      !centavosSeguros(datos.montoCentavos) || !metodos.includes(datos.metodo) ||
      typeof datos.solicitudId !== 'string' || !uuid.test(datos.solicitudId)) {
    return res.status(400).json({ mensaje: 'Datos de pago inválidos' })
  }
  datos.solicitudId = datos.solicitudId.toLowerCase()
  res.set('Cache-Control', 'no-store')

  // Una clave previa se resuelve antes de consultar el estado actual de cita o caja.
  // Así un reintento del mismo registro conserva su respuesta tras un cierre.
  const previo = await Pago.findOne({ solicitudId: datos.solicitudId })
  if (previo) {
    if (!mismoIntento(previo, datos, req.usuario._id)) {
      return res.status(409).json({ mensaje: 'Identificador de solicitud ya utilizado' })
    }
    return res.json({ pago: respuestaPago(previo, { incluirSolicitud: true }), repetido: true })
  }

  await Promise.all([Pago.init(), Contador.init()])
  const session = await mongoose.startSession()
  let pago
  try {
    session.startTransaction()
    const cita = await Cita.findById(datos.cita).session(session)
    if (!cita) throw errorFinanciero(404, 'Cita no encontrada')
    if (cita.estado === 'CANCELADA') throw errorFinanciero(409, 'La cita está cancelada')
    const caja = await Caja.findOne({ usuarioResponsable: req.usuario._id,
      estado: 'ABIERTA' }).session(session)
    if (!caja) throw errorFinanciero(409, 'Abre tu caja antes de registrar pagos')

    const totalAnterior = await totalPagadoCita(cita.id, session)
    const totalNuevo = sumarCentavos(totalAnterior, datos.montoCentavos)
    if (totalNuevo > cita.precioCentavos) {
      throw errorFinanciero(409, 'El pago supera el saldo de la cita')
    }

    // Las citas previas a 9.2B carecen de este campo en MongoDB.
    const revisionCita = cita.revisionFinanciera === 0 ?
      { $in: [null, 0] } : cita.revisionFinanciera
    const citaActualizada = await Cita.updateOne({ _id: cita._id,
      estado: { $ne: 'CANCELADA' }, revisionFinanciera: revisionCita },
    { $inc: { revisionFinanciera: 1 } }, { session })
    if (citaActualizada.modifiedCount !== 1) {
      throw errorFinanciero(409, 'La cita cambió; vuelve a consultarla')
    }
    const cajaActualizada = await Caja.updateOne({ _id: caja._id,
      usuarioResponsable: req.usuario._id, estado: 'ABIERTA',
      revisionMovimientos: caja.revisionMovimientos },
    { $inc: { revisionMovimientos: 1 } }, { session })
    if (cajaActualizada.modifiedCount !== 1) {
      throw errorFinanciero(409, 'La caja cambió; vuelve a consultarla')
    }

    const numeroComprobante = await siguienteComprobantePago(session)
    ;[pago] = await Pago.create([{ numeroComprobante, paciente: cita.paciente,
      cita: cita._id, caja: caja._id, montoCentavos: datos.montoCentavos,
      metodo: datos.metodo, registradoPor: req.usuario._id,
      solicitudId: datos.solicitudId }], { session })
    await session.commitTransaction()
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction()
    // También resuelve una carrera por solicitudId o un resultado de commit incierto.
    const registrado = await Pago.findOne({ solicitudId: datos.solicitudId })
    if (registrado) {
      if (!mismoIntento(registrado, datos, req.usuario._id)) {
        return res.status(409).json({ mensaje: 'Identificador de solicitud ya utilizado' })
      }
      return res.json({ pago: respuestaPago(registrado, { incluirSolicitud: true }), repetido: true })
    }
    if (esConflictoFinanciero(error) || error.hasErrorLabel?.('UnknownTransactionCommitResult')) {
      return res.status(409).json({ mensaje: 'Conflicto de pago; vuelve a consultar antes de reintentar' })
    }
    throw error
  } finally {
    await session.endSession()
  }
  res.status(201).json({ pago: respuestaPago(pago, { incluirSolicitud: true }), repetido: false })
})

router.patch('/:id/anular', autorizar('PAGOS_ANULAR', ['ADMINISTRADOR']), async (req, res) => {
  const datos = req.body
  if (Object.keys(req.query).length || !mongoose.isValidObjectId(req.params.id) ||
      !datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 1 || !Object.hasOwn(datos, 'motivo') ||
      typeof datos.motivo !== 'string' || !datos.motivo.trim() ||
      datos.motivo.trim().length > 500) {
    return res.status(400).json({ mensaje: 'Motivo de anulación inválido' })
  }
  const session = await mongoose.startSession()
  let anulado
  try {
    session.startTransaction()
    const pago = await Pago.findById(req.params.id).session(session)
    if (!pago) throw errorFinanciero(404, 'Pago no encontrado')
    if (pago.estado !== 'REGISTRADO') throw errorFinanciero(409, 'El pago ya está anulado')
    const caja = await Caja.findById(pago.caja).session(session)
    if (!caja || caja.estado !== 'ABIERTA') {
      throw errorFinanciero(409, 'No se puede anular un pago de una caja cerrada')
    }
    const cita = await Cita.findById(pago.cita).session(session)
    if (!cita) throw errorFinanciero(409, 'La cita del pago no está disponible')

    const revisionCita = cita.revisionFinanciera === 0 ?
      { $in: [null, 0] } : cita.revisionFinanciera
    const citaActualizada = await Cita.updateOne({ _id: cita._id,
      revisionFinanciera: revisionCita },
    { $inc: { revisionFinanciera: 1 } }, { session })
    if (citaActualizada.modifiedCount !== 1) {
      throw errorFinanciero(409, 'La cita cambió; vuelve a consultarla')
    }
    const cajaActualizada = await Caja.updateOne({ _id: caja._id, estado: 'ABIERTA',
      revisionMovimientos: caja.revisionMovimientos },
    { $inc: { revisionMovimientos: 1 } }, { session })
    if (cajaActualizada.modifiedCount !== 1) {
      throw errorFinanciero(409, 'La caja cambió; vuelve a consultarla')
    }
    anulado = await Pago.findOneAndUpdate({ _id: pago._id, estado: 'REGISTRADO' },
      { $set: { estado: 'ANULADO', motivoAnulacion: datos.motivo.trim(),
        fechaAnulacion: new Date(), anuladoPor: req.usuario._id } },
      { returnDocument: 'after', runValidators: true, session })
    if (!anulado) throw errorFinanciero(409, 'El pago cambió; vuelve a consultarlo')
    await session.commitTransaction()
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction()
    if (esConflictoFinanciero(error) || error.hasErrorLabel?.('UnknownTransactionCommitResult')) {
      return res.status(409).json({ mensaje: 'Conflicto de anulación; vuelve a consultar el pago' })
    }
    throw error
  } finally {
    await session.endSession()
  }
  res.json({ pago: respuestaPago(anulado, { auditoria: true }) })
})

export default router
