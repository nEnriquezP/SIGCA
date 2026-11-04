import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar } from '../middleware/autenticacion.js'
import Caja from '../models/Caja.js'
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
  res.json({ caja: caja ? resumen(caja) : null })
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
