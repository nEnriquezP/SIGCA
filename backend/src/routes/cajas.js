import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar } from '../middleware/autenticacion.js'
import Caja from '../models/Caja.js'
import Pago from '../models/Pago.js'
import { centavosSeguros, errorFinanciero, esConflictoFinanciero,
  sumarCentavos, totalesCaja } from '../services/finanzas.js'

const router = Router()
const rolesCaja = ['ADMINISTRADOR', 'RECEPCIONISTA']

function autorizar(permiso) {
  return (req, res, next) => {
    if (!rolesCaja.includes(req.usuario.rol) || !req.permisos.has(permiso)) {
      return res.status(403).json({ mensaje: 'Acceso no permitido' })
    }
    next()
  }
}

function fechaGuatemala(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha)
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.year}-${datos.month}-${datos.day}`
}

function resumen(caja) {
  return { id: caja.id, usuarioResponsable: String(caja.usuarioResponsable),
    fechaOperativa: caja.fechaOperativa, estado: caja.estado,
    abiertaEn: caja.abiertaEn, montoInicialCentavos: caja.montoInicialCentavos,
    revisionMovimientos: caja.revisionMovimientos,
    ...(caja.estado === 'CERRADA' ? {
      cerradaEn: caja.cerradaEn, cerradaPor: String(caja.cerradaPor),
      totalEfectivoCentavos: caja.totalEfectivoCentavos,
      totalTransferenciaCentavos: caja.totalTransferenciaCentavos,
      totalTarjetaCentavos: caja.totalTarjetaCentavos,
      totalIngresosCentavos: caja.totalIngresosCentavos,
      efectivoEsperadoCentavos: caja.efectivoEsperadoCentavos,
      efectivoContadoCentavos: caja.efectivoContadoCentavos,
      diferenciaCentavos: caja.diferenciaCentavos,
    } : {}) }
}

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const fecha = new Date(`${valor}T00:00:00.000Z`)
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
}

function importesActuales(caja, totales) {
  return { totalEfectivoCentavos: totales.EFECTIVO,
    totalTransferenciaCentavos: totales.TRANSFERENCIA,
    totalTarjetaCentavos: totales.TARJETA,
    totalIngresosCentavos: sumarCentavos(
      sumarCentavos(totales.EFECTIVO, totales.TRANSFERENCIA), totales.TARJETA),
    efectivoEsperadoCentavos: sumarCentavos(caja.montoInicialCentavos, totales.EFECTIVO) }
}

function filtroCajaAutorizada(req) {
  return { _id: req.params.id,
    ...(req.usuario.rol === 'RECEPCIONISTA' ? { usuarioResponsable: req.usuario._id } : {}) }
}

function respuestaMovimiento(pago, administrador) {
  return { id: pago.id, numeroComprobante: pago.numeroComprobante,
    paciente: String(pago.paciente), cita: String(pago.cita), caja: String(pago.caja),
    montoCentavos: pago.montoCentavos, metodo: pago.metodo, fechaPago: pago.fechaPago,
    estado: pago.estado, registradoPor: String(pago.registradoPor),
    ...(pago.estado === 'ANULADO' ? {
      fechaAnulacion: pago.fechaAnulacion,
      anuladoPor: pago.anuladoPor ? String(pago.anuladoPor) : null,
      ...(administrador ? { motivoAnulacion: pago.motivoAnulacion } : {}),
    } : {}) }
}

router.use(autenticar)

router.post('/abrir', autorizar('CAJA_ABRIR'), async (req, res) => {
  const datos = req.body
  if (Object.keys(req.query).length || !datos || typeof datos !== 'object' ||
      Array.isArray(datos) || Object.keys(datos).length !== 1 ||
      !Object.hasOwn(datos, 'montoInicialCentavos') ||
      !Number.isSafeInteger(datos.montoInicialCentavos) || datos.montoInicialCentavos < 0) {
    return res.status(400).json({ mensaje: 'Monto inicial en centavos inválido' })
  }

  // Preparar el índice antes de aceptar aperturas, incluso en una base recién creada.
  await Caja.init()
  if (await Caja.exists({ usuarioResponsable: req.usuario._id, estado: 'ABIERTA' })) {
    return res.status(409).json({ mensaje: 'Ya tienes una caja abierta' })
  }
  try {
    const apertura = new Date()
    const caja = await Caja.create({ usuarioResponsable: req.usuario._id,
      fechaOperativa: fechaGuatemala(apertura), abiertaEn: apertura,
      montoInicialCentavos: datos.montoInicialCentavos })
    res.status(201).json({ caja: resumen(caja) })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ mensaje: 'Ya tienes una caja abierta' })
    }
    throw error
  }
})

router.get('/actual', autorizar('CAJA_VER_PROPIA'), async (req, res) => {
  if (Object.keys(req.query).length) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  res.set('Cache-Control', 'no-store')
  const caja = await Caja.findOne({ usuarioResponsable: req.usuario._id, estado: 'ABIERTA' })
  // La fecha operativa permanece fijada al abrir, incluso si la caja cruza medianoche.
  res.json({ caja: caja ? { ...resumen(caja),
    ...importesActuales(caja, await totalesCaja(caja.id)) } : null })
})

router.get('/', autorizar('CAJA_HISTORIAL_VER'), async (req, res) => {
  const { pagina = '0', estado, fechaOperativa, usuarioResponsable } = req.query
  if (req.usuario.rol === 'RECEPCIONISTA' && usuarioResponsable !== undefined) {
    return res.status(403).json({ mensaje: 'Acceso no permitido' })
  }
  if (Object.keys(req.query).some((campo) => !['pagina', 'estado', 'fechaOperativa',
    'usuarioResponsable'].includes(campo)) || typeof pagina !== 'string' ||
      !/^(0|[1-9]\d{0,3})$/.test(pagina) ||
      (estado !== undefined && (typeof estado !== 'string' ||
        !['ABIERTA', 'CERRADA'].includes(estado))) ||
      (fechaOperativa !== undefined && !fechaValida(fechaOperativa)) ||
      (usuarioResponsable !== undefined && (typeof usuarioResponsable !== 'string' ||
        !mongoose.isValidObjectId(usuarioResponsable)))) {
    return res.status(400).json({ mensaje: 'Filtros de caja inválidos' })
  }
  const filtro = {}
  if (estado) filtro.estado = estado
  if (fechaOperativa) filtro.fechaOperativa = fechaOperativa
  if (req.usuario.rol === 'RECEPCIONISTA') filtro.usuarioResponsable = req.usuario._id
  else if (usuarioResponsable) filtro.usuarioResponsable = usuarioResponsable
  const numeroPagina = Number(pagina)
  res.set('Cache-Control', 'no-store')
  const [cajas, total] = await Promise.all([
    Caja.find(filtro).sort({ abiertaEn: -1, _id: -1 })
      .skip(numeroPagina * 50).limit(50),
    Caja.countDocuments(filtro),
  ])
  res.json({ cajas: cajas.map(resumen), total, pagina: numeroPagina,
    hayMas: (numeroPagina + 1) * 50 < total })
})

router.get('/:id/movimientos', autorizar('CAJA_HISTORIAL_VER'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const caja = await Caja.findOne(filtroCajaAutorizada(req))
  if (!caja) return res.status(404).json({ mensaje: 'Caja no encontrada' })
  const pagina = req.query.pagina ?? '0'
  if (Object.keys(req.query).some((campo) => campo !== 'pagina') ||
      typeof pagina !== 'string' || !/^(0|[1-9]\d{0,3})$/.test(pagina)) {
    return res.status(400).json({ mensaje: 'Página inválida' })
  }
  const numeroPagina = Number(pagina)
  const filtro = { caja: caja._id }
  res.set('Cache-Control', 'no-store')
  const [pagos, total] = await Promise.all([
    Pago.find(filtro).sort({ fechaPago: -1, _id: -1 })
      .skip(numeroPagina * 50).limit(50),
    Pago.countDocuments(filtro),
  ])
  res.json({ caja: caja.id, movimientos: pagos.map((pago) =>
    respuestaMovimiento(pago, req.usuario.rol === 'ADMINISTRADOR')),
  total, pagina: numeroPagina, hayMas: (numeroPagina + 1) * 50 < total })
})

router.get('/:id', autorizar('CAJA_HISTORIAL_VER'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || Object.keys(req.query).length) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const caja = await Caja.findOne(filtroCajaAutorizada(req))
  if (!caja) return res.status(404).json({ mensaje: 'Caja no encontrada' })
  res.set('Cache-Control', 'no-store')
  const importes = importesActuales(caja, await totalesCaja(caja.id))
  if (caja.estado === 'ABIERTA') return res.json({ caja: { ...resumen(caja), ...importes } })
  const coincide = ['totalEfectivoCentavos', 'totalTransferenciaCentavos',
    'totalTarjetaCentavos', 'totalIngresosCentavos', 'efectivoEsperadoCentavos']
    .every((campo) => caja[campo] === importes[campo])
  res.json({ caja: resumen(caja), conciliacion: { coincide,
    importesCalculadosDeMovimientos: importes } })
})

router.post('/:id/cerrar', autorizar('CAJA_CERRAR_PROPIA'), async (req, res) => {
  const datos = req.body
  if (Object.keys(req.query).length || typeof req.params.id !== 'string' ||
      !mongoose.isValidObjectId(req.params.id) || !datos || typeof datos !== 'object' ||
      Array.isArray(datos) || Object.keys(datos).length !== 1 ||
      !Object.hasOwn(datos, 'efectivoContadoCentavos') ||
      !centavosSeguros(datos.efectivoContadoCentavos, true)) {
    return res.status(400).json({ mensaje: 'Datos de cierre inválidos' })
  }
  res.set('Cache-Control', 'no-store')
  const session = await mongoose.startSession()
  let cerrada
  try {
    session.startTransaction()
    const caja = await Caja.findOne({ _id: req.params.id,
      usuarioResponsable: req.usuario._id }).session(session)
    if (!caja) throw errorFinanciero(404, 'Caja no encontrada')
    if (caja.estado !== 'ABIERTA') throw errorFinanciero(409, 'La caja ya está cerrada')

    const totales = await totalesCaja(caja.id, session)
    const totalIngresosCentavos = sumarCentavos(
      sumarCentavos(totales.EFECTIVO, totales.TRANSFERENCIA), totales.TARJETA)
    const efectivoEsperadoCentavos = sumarCentavos(caja.montoInicialCentavos, totales.EFECTIVO)
    const diferenciaCentavos = datos.efectivoContadoCentavos - efectivoEsperadoCentavos
    if (!Number.isSafeInteger(diferenciaCentavos)) {
      throw errorFinanciero(409, 'Diferencia fuera del rango seguro')
    }
    cerrada = await Caja.findOneAndUpdate({ _id: caja._id,
      usuarioResponsable: req.usuario._id, estado: 'ABIERTA',
      revisionMovimientos: caja.revisionMovimientos },
    { $set: { estado: 'CERRADA', cerradaEn: new Date(), cerradaPor: req.usuario._id,
      totalEfectivoCentavos: totales.EFECTIVO,
      totalTransferenciaCentavos: totales.TRANSFERENCIA,
      totalTarjetaCentavos: totales.TARJETA,
      totalIngresosCentavos, efectivoEsperadoCentavos,
      efectivoContadoCentavos: datos.efectivoContadoCentavos, diferenciaCentavos },
    $inc: { revisionMovimientos: 1 } },
    { returnDocument: 'after', runValidators: true, session })
    if (!cerrada) throw errorFinanciero(409, 'La caja cambió; vuelve a consultarla')
    await session.commitTransaction()
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction()
    if (esConflictoFinanciero(error) || error.hasErrorLabel?.('UnknownTransactionCommitResult')) {
      return res.status(409).json({ mensaje: 'Conflicto de caja; vuelve a consultarla' })
    }
    throw error
  } finally {
    await session.endSession()
  }
  res.json({ caja: resumen(cerrada) })
})

export default router
