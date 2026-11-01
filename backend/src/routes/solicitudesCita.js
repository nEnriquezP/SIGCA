import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Cita from '../models/Cita.js'
import Paciente from '../models/Paciente.js'
import Servicio from '../models/Servicio.js'
import SolicitudCita from '../models/SolicitudCita.js'
import Usuario from '../models/Usuario.js'
import { avisarCita } from '../services/correo.js'
import { ahoraGuatemala, errorCita, fechaMaximaGuatemala, fechaValida, prepararCita } from '../services/prepararCita.js'

const router = Router()
const limitarEnvios = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: (req) => ({ mensaje: `Demasiadas solicitudes. Intenta de nuevo en ${Math.max(1,
    Math.ceil((new Date(req.rateLimit?.resetTime).getTime() - Date.now()) / 60000))} minuto(s).` }),
})
const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const telefonoValido = /^[+\d][\d\s()+.-]{6,29}$/

function texto(valor, maximo) {
  return typeof valor === 'string' && Boolean(valor.trim()) && valor.trim().length <= maximo
}

function validarSolicitud(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 6 ||
      Object.keys(datos).some((campo) => !['nombreSolicitante', 'correo', 'telefono',
        'servicio', 'fechaPreferida', 'mensajeAdicional'].includes(campo)) ||
      !texto(datos.nombreSolicitante, 120) || !texto(datos.correo, 254) ||
      !correoValido.test(datos.correo.trim()) || !texto(datos.telefono, 30) ||
      !telefonoValido.test(datos.telefono.trim()) ||
      !mongoose.isValidObjectId(datos.servicio) || !fechaValida(datos.fechaPreferida) ||
      (datos.fechaPreferida < ahoraGuatemala().fecha ||
        datos.fechaPreferida > fechaMaximaGuatemala()) ||
      typeof datos.mensajeAdicional !== 'string' || datos.mensajeAdicional.trim().length > 2000) {
    return 'Revisa el contacto, el servicio y la fecha preferida: debe estar entre hoy y los próximos 365 días de Guatemala'
  }
  return null
}

function detalle(item) {
  return { id: item.id, nombreSolicitante: item.nombreSolicitante,
    correo: item.correo, telefono: item.telefono, servicio: String(item.servicio),
    fechaPreferida: item.fechaPreferida, mensajeAdicional: item.mensajeAdicional,
    estado: item.estado, cita: item.cita ? String(item.cita) : null,
    creadoEn: item.createdAt }
}

router.post('/', limitarEnvios, async (req, res) => {
  const error = validarSolicitud(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const servicio = await Servicio.findOne({ _id: req.body.servicio, estado: 'ACTIVO' })
  if (!servicio) return res.status(409).json({ mensaje: 'El servicio no existe o está inactivo' })
  const solicitud = await SolicitudCita.create({
    nombreSolicitante: req.body.nombreSolicitante.trim(),
    correo: req.body.correo.trim().toLowerCase(), telefono: req.body.telefono.trim(),
    servicio: servicio.id, fechaPreferida: req.body.fechaPreferida,
    mensajeAdicional: req.body.mensajeAdicional.trim(),
  })
  res.status(201).json({ solicitud: { id: solicitud.id, estado: 'PENDIENTE' },
    mensaje: 'Solicitud recibida. La fecha es preferida; aún no existe una cita confirmada ni un horario reservado.' })
})

router.use(autenticar, permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'))

router.get('/', async (req, res) => {
  if (Object.keys(req.query).some((campo) => !['estado', 'buscar', 'pagina'].includes(campo)) ||
      (req.query.estado !== undefined && !['PENDIENTE', 'ATENDIDA', 'RECHAZADA'].includes(req.query.estado)) ||
      (req.query.buscar !== undefined && typeof req.query.buscar !== 'string') ||
      (req.query.pagina !== undefined && !/^(0|[1-9]\d{0,4})$/.test(req.query.pagina))) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const buscar = (req.query.buscar ?? '').trim()
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const filtro = {}
  if (req.query.estado) filtro.estado = req.query.estado
  if (buscar) {
    const patron = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filtro.$or = ['nombreSolicitante', 'correo'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (mongoose.isValidObjectId(buscar)) filtro.$or.push({ _id: buscar })
  }
  const pagina = Number(req.query.pagina ?? 0)
  let consulta = SolicitudCita.find(filtro).sort({ createdAt: -1, _id: -1 })
  if (pagina) consulta = consulta.skip(pagina * 100)
  const solicitudes = await consulta.limit(101)
  res.json({ solicitudes: solicitudes.slice(0, 100).map(detalle),
    hayMas: solicitudes.length > 100, pagina })
})

router.get('/opciones', async (req, res) => {
  if (Object.keys(req.query).some((campo) => !['buscarPaciente', 'paginaPacientes',
    'pacienteSeleccionado', 'soloPacientes'].includes(campo)) ||
      (req.query.buscarPaciente !== undefined && typeof req.query.buscarPaciente !== 'string') ||
      (req.query.paginaPacientes !== undefined &&
        (typeof req.query.paginaPacientes !== 'string' || !/^(0|[1-9]\d{0,4})$/.test(req.query.paginaPacientes))) ||
      (req.query.pacienteSeleccionado !== undefined && !mongoose.isValidObjectId(req.query.pacienteSeleccionado)) ||
      (req.query.soloPacientes !== undefined && req.query.soloPacientes !== '1')) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const buscar = (req.query.buscarPaciente ?? '').trim()
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const pagina = Number(req.query.paginaPacientes ?? 0)
  const filtro = { estado: 'ACTIVO' }
  if (buscar) {
    const patron = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filtro.$or = ['codigo', 'nombres', 'apellidos'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (mongoose.isValidObjectId(buscar)) filtro.$or.push({ _id: buscar })
  }
  const [pacientes, pacientesTotal, seleccionado] = await Promise.all([
    Paciente.find(filtro).sort({ apellidos: 1, nombres: 1, _id: 1 })
      .skip(pagina * 10).limit(10),
    Paciente.countDocuments(filtro),
    req.query.pacienteSeleccionado ? Paciente.findOne({ _id: req.query.pacienteSeleccionado,
      estado: 'ACTIVO' }) : null,
  ])
  const resultado = { pacientes: pacientes.map((p) => ({ id: p.id, codigo: p.codigo ?? null,
    nombre: `${p.nombres} ${p.apellidos}` })), pacientesTotal, paginaPacientes: pagina,
  pacienteSeleccionado: seleccionado ? { id: seleccionado.id,
    codigo: seleccionado.codigo ?? null, nombre: `${seleccionado.nombres} ${seleccionado.apellidos}` } : null }
  if (req.query.soloPacientes === '1') return res.json(resultado)
  const profesionales = await Usuario.find({ rol: 'PROFESIONAL', activo: true })
    .select('nombre rol activo').sort({ nombre: 1, _id: 1 })
  res.json({ ...resultado, profesionales: profesionales.map((p) => ({ id: p.id, nombre: p.nombre })) })
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const solicitud = await SolicitudCita.findById(req.params.id)
  if (!solicitud) return res.status(404).json({ mensaje: 'Solicitud no encontrada' })
  res.json({ solicitud: detalle(solicitud) })
})

router.patch('/:id/rechazar', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length) return res.status(400).json({ mensaje: 'No se esperan datos adicionales' })
  const solicitud = await SolicitudCita.findOneAndUpdate(
    { _id: req.params.id, estado: 'PENDIENTE' }, { $set: { estado: 'RECHAZADA' } },
    { returnDocument: 'after', runValidators: true })
  if (!solicitud) {
    const existe = await SolicitudCita.findById(req.params.id)
    return res.status(existe ? 409 : 404).json({ mensaje: existe ?
      'Solo se puede rechazar una solicitud pendiente' : 'Solicitud no encontrada' })
  }
  res.json({ solicitud: detalle(solicitud) })
})

router.post('/:id/convertir', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const datos = req.body
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 4 ||
      Object.keys(datos).some((campo) => !['paciente', 'profesional', 'fecha', 'horaInicio'].includes(campo)) ||
      !mongoose.isValidObjectId(datos.paciente) || !mongoose.isValidObjectId(datos.profesional) ||
      !fechaValida(datos.fecha) || typeof datos.horaInicio !== 'string' ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(datos.horaInicio)) {
    return res.status(400).json({ mensaje: 'Paciente, profesional, fecha y hora válidos son obligatorios' })
  }

  // El índice único se prepara fuera de la transacción, incluso en una base recién creada.
  await Cita.init()
  const session = await mongoose.startSession()
  try {
    const citaId = await session.withTransaction(async () => {
      const actual = await SolicitudCita.findById(req.params.id, null, { session })
      if (!actual) throw errorCita(404, 'Solicitud no encontrada')
      if (actual.estado !== 'PENDIENTE') throw errorCita(409, 'La solicitud ya fue atendida o rechazada')
      const solicitud = await SolicitudCita.findOneAndUpdate(
        { _id: req.params.id, estado: 'PENDIENTE' }, { $set: { estado: 'ATENDIDA' } },
        { session, returnDocument: 'after', runValidators: true })
      if (!solicitud) throw errorCita(409, 'La solicitud ya fue procesada')

      const datosCita = await prepararCita({ pacienteId: datos.paciente,
        servicioId: solicitud.servicio, profesionalId: datos.profesional,
        fecha: datos.fecha, horaInicio: datos.horaInicio, session })
      const [cita] = await Cita.create([{ ...datosCita, solicitudCita: solicitud.id }], { session })
      const resultado = await SolicitudCita.updateOne({ _id: solicitud.id, estado: 'ATENDIDA' },
        { $set: { cita: cita._id } }, { session })
      if (resultado.matchedCount !== 1) throw errorCita(409, 'La solicitud cambió durante la conversión')
      return String(cita.id)
    })
    await avisarCita(citaId, 'PENDIENTE')
    res.status(201).json({ solicitud: { id: req.params.id, estado: 'ATENDIDA', cita: citaId },
      mensaje: 'Cita creada en estado PENDIENTE. La solicitud fue atendida.' })
  } catch (error) {
    if (error.code === 11000 || error.code === 112 ||
        error.hasErrorLabel?.('TransientTransactionError')) {
      return res.status(409).json({ mensaje: 'Conflicto al convertir la solicitud. Consulta su estado y vuelve a intentar.' })
    }
    throw error
  } finally {
    await session.endSession()
  }
})

export default router
