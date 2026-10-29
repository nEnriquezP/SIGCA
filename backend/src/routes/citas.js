import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar } from '../middleware/autenticacion.js'
import Cita from '../models/Cita.js'
import Paciente from '../models/Paciente.js'
import Servicio from '../models/Servicio.js'
import Usuario from '../models/Usuario.js'
import { errorCita, fechaValida, prepararCita } from '../services/prepararCita.js'

const router = Router()
const estados = ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA']
const estadosActivos = ['PENDIENTE', 'CONFIRMADA']
const formatoHora = /^([01]\d|2[0-3]):[0-5]\d$/
const rolesGestion = ['ADMINISTRADOR', 'RECEPCIONISTA']

function gestor(req) { return rolesGestion.includes(req.usuario.rol) }
function esObjeto(datos) { return datos && typeof datos === 'object' && !Array.isArray(datos) }
function camposExactos(datos, obligatorios, opcionales = []) {
  if (!esObjeto(datos)) return false
  const claves = Object.keys(datos)
  return obligatorios.every((campo) => claves.includes(campo)) &&
    claves.every((campo) => [...obligatorios, ...opcionales].includes(campo))
}
function observacionesValidas(valor) {
  return typeof valor === 'string' && valor.trim().length <= 2000
}
function idValido(valor) { return typeof valor === 'string' && mongoose.isValidObjectId(valor) }
function nombrePaciente(paciente) {
  return paciente ? `${paciente.nombres} ${paciente.apellidos}`.trim() : 'Paciente no disponible'
}
function respuestaCita(cita, profesional = false) {
  return {
    id: cita.id,
    paciente: { id: String(cita.paciente?._id ?? cita.paciente),
      codigo: cita.paciente?.codigo ?? null, nombre: nombrePaciente(cita.paciente) },
    servicio: { id: String(cita.servicio?._id ?? cita.servicio),
      nombre: cita.servicio?.nombre ?? 'Servicio no disponible' },
    profesional: { id: String(cita.profesional?._id ?? cita.profesional),
      nombre: cita.profesional?.nombre ?? 'Profesional no disponible' },
    fecha: cita.fecha, horaInicio: cita.horaInicio, horaFin: cita.horaFin,
    duracionMinutos: cita.duracionMinutos, precioCentavos: cita.precioCentavos,
    estado: cita.estado, creadoEn: cita.createdAt,
    ...(profesional ? {} : {
      solicitudCita: cita.solicitudCita ? String(cita.solicitudCita) : null,
      observacionesAdministrativas: cita.observacionesAdministrativas,
    }),
  }
}
function poblar(consulta) {
  return consulta.populate('paciente', 'codigo nombres apellidos')
    .populate('servicio', 'nombre').populate('profesional', 'nombre')
}
function conflictoDeIndice(error) {
  return error.code === 11000 || error.code === 112 ||
    error.hasErrorLabel?.('TransientTransactionError')
}

router.use(autenticar, (req, res, next) => {
  if (!gestor(req) && req.usuario.rol !== 'PROFESIONAL') {
    return res.status(403).json({ mensaje: 'Acceso no permitido' })
  }
  next()
})

router.get('/opciones', async (req, res) => {
  if (!gestor(req)) return res.status(403).json({ mensaje: 'Acceso no permitido' })
  if (Object.keys(req.query).some((campo) => campo !== 'buscarPaciente') ||
      (req.query.buscarPaciente !== undefined && typeof req.query.buscarPaciente !== 'string')) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const buscar = (req.query.buscarPaciente ?? '').trim()
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const filtroPaciente = { estado: 'ACTIVO' }
  if (buscar) {
    const patron = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filtroPaciente.$or = ['codigo', 'nombres', 'apellidos'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (idValido(buscar)) filtroPaciente.$or.push({ _id: buscar })
  }
  const [pacientes, servicios, profesionales] = await Promise.all([
    Paciente.find(filtroPaciente).select('codigo nombres apellidos')
      .sort({ apellidos: 1, nombres: 1 }).limit(100),
    Servicio.find({ estado: 'ACTIVO' }).select('nombre codigo duracionMinutos precioCentavos')
      .sort({ nombre: 1 }).limit(100),
    Usuario.find({ rol: 'PROFESIONAL', activo: true }).select('nombre')
      .sort({ nombre: 1 }).limit(100),
  ])
  res.json({ pacientes: pacientes.map((p) => ({ id: p.id, codigo: p.codigo ?? null,
    nombre: nombrePaciente(p) })),
  servicios: servicios.map((s) => ({ id: s.id, codigo: s.codigo ?? null,
    nombre: s.nombre, duracionMinutos: s.duracionMinutos, precioCentavos: s.precioCentavos })),
  profesionales: profesionales.map((p) => ({ id: p.id, nombre: p.nombre })) })
})

router.get('/calendario', async (req, res) => {
  if (Object.keys(req.query).some((campo) => !['mes', 'profesional'].includes(campo)) ||
      typeof req.query.mes !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.mes) ||
      !fechaValida(`${req.query.mes}-01`) || Number(req.query.mes.slice(0, 4)) > 9998 ||
      (req.query.profesional !== undefined && !idValido(req.query.profesional))) {
    return res.status(400).json({ mensaje: 'Mes o profesional inválido' })
  }
  if (!gestor(req) && req.query.profesional && req.query.profesional !== String(req.usuario.id)) {
    return res.status(403).json({ mensaje: 'Solo puedes consultar tus citas' })
  }
  const [anio, mes] = req.query.mes.split('-').map(Number)
  const siguiente = new Date(Date.UTC(anio, mes, 1)).toISOString().slice(0, 10)
  const filtro = { fecha: { $gte: `${req.query.mes}-01`, $lt: siguiente } }
  if (gestor(req) && req.query.profesional) filtro.profesional = new mongoose.Types.ObjectId(req.query.profesional)
  if (!gestor(req)) filtro.profesional = req.usuario._id
  const filas = await Cita.aggregate([
    { $match: filtro },
    { $group: { _id: { fecha: '$fecha', estado: '$estado' }, total: { $sum: 1 } } },
    { $sort: { '_id.fecha': 1, '_id.estado': 1 } },
  ])
  const dias = new Map()
  for (const fila of filas) {
    const fecha = fila._id.fecha
    if (!dias.has(fecha)) dias.set(fecha, { fecha, total: 0, estados: {} })
    dias.get(fecha).total += fila.total
    dias.get(fecha).estados[fila._id.estado] = fila.total
  }
  res.json({ mes: req.query.mes, dias: [...dias.values()] })
})

router.get('/', async (req, res) => {
  if (Object.keys(req.query).some((campo) => !['profesional', 'paciente', 'fecha', 'estado', 'pagina'].includes(campo)) ||
      (req.query.profesional !== undefined && !idValido(req.query.profesional)) ||
      (req.query.paciente !== undefined && !idValido(req.query.paciente)) ||
      (req.query.fecha !== undefined && !fechaValida(req.query.fecha)) ||
      (req.query.estado !== undefined && !estados.includes(req.query.estado)) ||
      (req.query.pagina !== undefined &&
        (typeof req.query.pagina !== 'string' || !/^(0|[1-9]\d{0,2})$/.test(req.query.pagina)))) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  if (!gestor(req) && req.query.profesional && req.query.profesional !== String(req.usuario.id)) {
    return res.status(403).json({ mensaje: 'Solo puedes consultar tus citas' })
  }
  const filtro = {}
  if (req.query.paciente) filtro.paciente = req.query.paciente
  if (req.query.fecha) filtro.fecha = req.query.fecha
  if (req.query.estado) filtro.estado = req.query.estado
  if (gestor(req) && req.query.profesional) filtro.profesional = req.query.profesional
  if (!gestor(req)) filtro.profesional = req.usuario._id
  const pagina = Number(req.query.pagina ?? 0)
  const [citas, total] = await Promise.all([
    poblar(Cita.find(filtro).sort({ fecha: -1, horaInicio: -1, _id: -1 })
      .skip(pagina * 100).limit(100)),
    Cita.countDocuments(filtro),
  ])
  res.json({ citas: citas.map((c) => respuestaCita(c, !gestor(req))), total, pagina })
})

router.get('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const filtro = { _id: req.params.id }
  if (!gestor(req)) filtro.profesional = req.usuario._id
  const cita = await poblar(Cita.findOne(filtro))
  if (!cita) return res.status(404).json({ mensaje: 'Cita no encontrada' })
  res.json({ cita: respuestaCita(cita, !gestor(req)) })
})

router.post('/', async (req, res) => {
  if (!gestor(req)) return res.status(403).json({ mensaje: 'Acceso no permitido' })
  const datos = req.body
  if (!camposExactos(datos, ['paciente', 'servicio', 'profesional', 'fecha', 'horaInicio'],
    ['observacionesAdministrativas']) ||
      !idValido(datos.paciente) || !idValido(datos.servicio) || !idValido(datos.profesional) ||
      !fechaValida(datos.fecha) || !formatoHora.test(datos.horaInicio) ||
      (datos.observacionesAdministrativas !== undefined &&
        !observacionesValidas(datos.observacionesAdministrativas))) {
    return res.status(400).json({ mensaje: 'Datos de cita inválidos' })
  }
  await Cita.init()
  try {
    const preparada = await prepararCita({ pacienteId: datos.paciente,
      servicioId: datos.servicio, profesionalId: datos.profesional,
      fecha: datos.fecha, horaInicio: datos.horaInicio })
    const cita = await Cita.create({ ...preparada,
      observacionesAdministrativas: datos.observacionesAdministrativas?.trim() ?? '' })
    const guardada = await poblar(Cita.findById(cita.id))
    res.status(201).json({ cita: respuestaCita(guardada) })
  } catch (error) {
    if (conflictoDeIndice(error)) throw errorCita(409, 'Horario ocupado; vuelve a consultar la disponibilidad')
    throw error
  }
})

router.put('/:id', async (req, res) => {
  if (!gestor(req)) return res.status(403).json({ mensaje: 'Acceso no permitido' })
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const datos = req.body
  if (!camposExactos(datos, ['fecha', 'horaInicio', 'profesional', 'observacionesAdministrativas']) ||
      !fechaValida(datos.fecha) || !formatoHora.test(datos.horaInicio) ||
      !idValido(datos.profesional) || !observacionesValidas(datos.observacionesAdministrativas)) {
    return res.status(400).json({ mensaje: 'Datos de reprogramación inválidos' })
  }
  const actual = await Cita.findById(req.params.id)
  if (!actual) return res.status(404).json({ mensaje: 'Cita no encontrada' })
  if (!estadosActivos.includes(actual.estado)) {
    return res.status(409).json({ mensaje: 'Solo se puede reprogramar una cita pendiente o confirmada' })
  }
  await Cita.init()
  try {
    const preparada = await prepararCita({ pacienteId: actual.paciente,
      servicioId: actual.servicio, profesionalId: datos.profesional,
      fecha: datos.fecha, horaInicio: datos.horaInicio, citaExistente: actual })
    const cita = await Cita.findOneAndUpdate({ _id: actual.id, estado: actual.estado,
      fecha: actual.fecha, horaInicio: actual.horaInicio, profesional: actual.profesional },
    { $set: { profesional: preparada.profesional, fecha: preparada.fecha,
      horaInicio: preparada.horaInicio, horaFin: preparada.horaFin,
      minutosOcupados: preparada.minutosOcupados,
      observacionesAdministrativas: datos.observacionesAdministrativas.trim() } },
    { returnDocument: 'after', runValidators: true })
    if (!cita) throw errorCita(409, 'La cita cambió; vuelve a consultarla')
    res.json({ cita: respuestaCita(await poblar(Cita.findById(cita.id))) })
  } catch (error) {
    if (conflictoDeIndice(error)) throw errorCita(409, 'Horario ocupado; vuelve a consultar la disponibilidad')
    throw error
  }
})

router.patch('/:id/estado', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  if (!camposExactos(req.body, ['estado']) || !estados.includes(req.body.estado)) {
    return res.status(400).json({ mensaje: 'Estado inválido' })
  }
  const destino = req.body.estado
  const profesional = !gestor(req)
  if ((profesional && destino !== 'COMPLETADA') ||
      (!profesional && !['CONFIRMADA', 'CANCELADA'].includes(destino))) {
    return res.status(403).json({ mensaje: 'Acceso no permitido para este cambio' })
  }
  const filtro = { _id: req.params.id }
  if (profesional) filtro.profesional = req.usuario._id
  const actual = await Cita.findOne(filtro)
  if (!actual) return res.status(404).json({ mensaje: 'Cita no encontrada' })
  const permitida = destino === 'CONFIRMADA' ? actual.estado === 'PENDIENTE' :
    destino === 'COMPLETADA' ? actual.estado === 'CONFIRMADA' :
      estadosActivos.includes(actual.estado)
  if (!permitida) return res.status(409).json({ mensaje: 'Transición de estado no permitida' })

  // Fase de pagos: antes de cancelar, rechazar citas que tengan pagos válidos.
  // Aún no existe ese modelo; esta fase no afirma haber aplicado esa regla.
  const cita = await Cita.findOneAndUpdate({ ...filtro, estado: actual.estado },
    { $set: { estado: destino } }, { returnDocument: 'after', runValidators: true })
  if (!cita) return res.status(409).json({ mensaje: 'La cita cambió; vuelve a consultarla' })
  res.json({ cita: respuestaCita(await poblar(Cita.findById(cita.id)), profesional) })
})

export default router
