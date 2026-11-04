import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Cita from '../models/Cita.js'
import CodigoCorreoSolicitud from '../models/CodigoCorreoSolicitud.js'
import Paciente from '../models/Paciente.js'
import Servicio from '../models/Servicio.js'
import SolicitudCita from '../models/SolicitudCita.js'
import Usuario from '../models/Usuario.js'
import { crearSolicitudConCodigo } from '../services/codigosSolicitud.js'
import { avisarCita, avisarSolicitud, correoConfigurado, enviarCorreo } from '../services/correo.js'
import { ahoraGuatemala, errorCita, fechaMaximaGuatemala, fechaValida, prepararCita } from '../services/prepararCita.js'
import { correoCuentaValido } from '../services/validacionCuenta.js'
import { codigoSolicitudCorreoCoincide, generarCodigoSolicitudCorreo,
  hashCodigoSolicitudCorreo, MAX_INTENTOS_CODIGO_SOLICITUD,
  MINUTOS_CODIGO_SOLICITUD } from '../services/verificacionSolicitud.js'

const router = Router()
const limitarEnvios = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
  message: (req) => ({ mensaje: `Demasiadas solicitudes. Intenta de nuevo en ${Math.max(1,
    Math.ceil((new Date(req.rateLimit?.resetTime).getTime() - Date.now()) / 60000))} minuto(s).` }),
})
const limitarCodigos = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  standardHeaders: 'draft-8', legacyHeaders: false,
  message: { mensaje: 'Espera unos minutos antes de solicitar otro código.' } })
const telefonoValido = /^[1-9][0-9]{7}$/

function texto(valor, maximo) {
  return typeof valor === 'string' && Boolean(valor.trim()) && valor.trim().length <= maximo
}

export function validarSolicitud(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 9 ||
      Object.keys(datos).some((campo) => !['nombreSolicitante', 'correo', 'telefono',
        'servicio', 'fechaPreferida', 'mensajeAdicional', 'verificacionId',
        'codigoVerificacion', 'recibirPublicaciones'].includes(campo)) ||
      !texto(datos.nombreSolicitante, 120) ||
      !mongoose.isValidObjectId(datos.servicio) || !fechaValida(datos.fechaPreferida) ||
      (datos.fechaPreferida < ahoraGuatemala().fecha ||
        datos.fechaPreferida > fechaMaximaGuatemala()) ||
      typeof datos.mensajeAdicional !== 'string' || datos.mensajeAdicional.trim().length > 2000) {
    return 'Revisa el contacto, el servicio y la fecha preferida: debe estar entre hoy y los próximos 365 días de Guatemala'
  }
  if (!correoCuentaValido(datos.correo)) {
    return 'El correo debe tener la estructura nombre@dominio.com'
  }
  if (typeof datos.telefono !== 'string' || !telefonoValido.test(datos.telefono)) {
    return 'El teléfono debe tener exactamente 8 dígitos y no comenzar con 0'
  }
  if (!mongoose.isValidObjectId(datos.verificacionId) ||
      typeof datos.codigoVerificacion !== 'string' ||
      !/^\d{6}$/.test(datos.codigoVerificacion) ||
      typeof datos.recibirPublicaciones !== 'boolean') {
    return 'Solicita e ingresa el código de seis dígitos enviado a tu correo'
  }
  return null
}

function detalle(item) {
  return { id: item.id, codigo: item.codigo ?? null,
    nombreSolicitante: item.nombreSolicitante,
    correo: item.correo, correoVerificado: item.correoVerificado === true,
    recibirPublicaciones: item.recibirPublicaciones === true,
    telefono: item.telefono, servicio: String(item.servicio),
    fechaPreferida: item.fechaPreferida, mensajeAdicional: item.mensajeAdicional,
    estado: item.estado, cita: item.cita ? String(item.cita) : null,
    creadoEn: item.createdAt }
}

router.post('/enviar-codigo', limitarCodigos, async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !correoCuentaValido(req.body.correo)) {
    return res.status(400).json({ mensaje: 'Escribe un correo con formato nombre@dominio.com' })
  }
  if (!correoConfigurado() || typeof process.env.JWT_SECRET !== 'string' ||
      process.env.JWT_SECRET.length < 32) {
    return res.status(503).json({ mensaje: 'La verificación por correo no está disponible en este momento' })
  }
  const correo = req.body.correo.trim().toLowerCase()
  const ahora = new Date()
  const [ultimo, cantidad] = await Promise.all([
    CodigoCorreoSolicitud.findOne({ correo }).sort({ createdAt: -1 }),
    CodigoCorreoSolicitud.countDocuments({ correo,
      createdAt: { $gt: new Date(ahora.getTime() - 3600000) } }),
  ])
  if (cantidad >= 5 || (ultimo && ultimo.createdAt > new Date(ahora.getTime() - 60000))) {
    return res.status(429).json({ mensaje: 'Espera antes de solicitar otro código para este correo' })
  }
  const _id = new mongoose.Types.ObjectId()
  const codigo = generarCodigoSolicitudCorreo()
  const desafio = await CodigoCorreoSolicitud.create({ _id, correo,
    hash: hashCodigoSolicitudCorreo(_id, correo, codigo),
    vence: new Date(ahora.getTime() + MINUTOS_CODIGO_SOLICITUD * 60000) })
  try {
    await enviarCorreo({ destinatario: correo, asunto: 'Código para solicitar cita',
      texto: `Tu código para solicitar una cita es ${codigo}. Vence en ${MINUTOS_CODIGO_SOLICITUD} minutos. ` +
        'Todavía no se ha registrado una solicitud ni se ha reservado un horario. ' +
        'Si no solicitaste este código, ignora el mensaje.',
      clave: `codigo-solicitud:${desafio.id}` })
  } catch {
    await CodigoCorreoSolicitud.deleteOne({ _id }).catch(() => {})
    return res.status(503).json({ mensaje: 'No se pudo enviar el código. Intenta de nuevo más tarde.' })
  }
  res.set('Cache-Control', 'no-store')
  res.json({ verificacionId: desafio.id, venceMinutos: MINUTOS_CODIGO_SOLICITUD,
    mensaje: 'Enviamos un código de seis dígitos a tu correo. Ingrésalo antes de enviar la solicitud.' })
})

router.post('/', limitarEnvios, async (req, res) => {
  const error = validarSolicitud(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const correo = req.body.correo.trim().toLowerCase()
  const servicio = await Servicio.findOne({ _id: req.body.servicio, estado: 'ACTIVO' })
  if (!servicio) return res.status(409).json({ mensaje: 'El servicio no existe o está inactivo' })
  const desafio = await CodigoCorreoSolicitud.findOneAndUpdate({
    _id: req.body.verificacionId, correo, usado: false,
    vence: { $gt: new Date() }, intentos: { $lt: MAX_INTENTOS_CODIGO_SOLICITUD },
  }, { $inc: { intentos: 1 } }, { returnDocument: 'after' })
  if (!desafio) {
    return res.status(400).json({ mensaje: 'El código venció, fue utilizado o agotó sus intentos. Solicita otro.' })
  }
  if (!codigoSolicitudCorreoCoincide(desafio.hash, desafio.id, correo,
    req.body.codigoVerificacion)) {
    return res.status(400).json({ mensaje: 'El código no coincide. Revísalo o solicita otro.' })
  }

  await SolicitudCita.init()
  const session = await mongoose.startSession()
  try {
    const solicitud = await session.withTransaction(async () => {
      const consumido = await CodigoCorreoSolicitud.updateOne({ _id: desafio.id,
        correo, usado: false, vence: { $gt: new Date() } },
      { $set: { usado: true } }, { session })
      if (consumido.matchedCount !== 1) {
        throw errorCita(409, 'El código ya fue usado o venció. Solicita otro.')
      }
      const vigente = await Servicio.findOne({ _id: req.body.servicio, estado: 'ACTIVO' },
        null, { session })
      if (!vigente) throw errorCita(409, 'El servicio ya no está activo')
      return crearSolicitudConCodigo({
        nombreSolicitante: req.body.nombreSolicitante.trim(),
        correo, correoVerificado: true,
        recibirPublicaciones: req.body.recibirPublicaciones,
        telefono: req.body.telefono, servicio: vigente.id,
        fechaPreferida: req.body.fechaPreferida,
        mensajeAdicional: req.body.mensajeAdicional.trim(),
      }, undefined, session)
    })
    const correoEnviado = await avisarSolicitud(solicitud, 'RECIBIDA')
    res.set('Cache-Control', 'no-store')
    res.status(201).json({ solicitud: { id: solicitud.id, codigo: solicitud.codigo,
      estado: 'PENDIENTE' },
    mensaje: 'Solicitud recibida. La fecha es preferida; aún no existe una cita confirmada ni un horario reservado.' +
      (correoEnviado ? ' Te enviamos una copia al correo verificado.' :
        ' Conserva el código para consultar con el centro.') })
  } catch (fallo) {
    if (fallo.code === 11000 || fallo.code === 112 ||
        fallo.hasErrorLabel?.('TransientTransactionError')) {
      return res.status(409).json({ mensaje: 'No se pudo registrar por un conflicto. Comprueba el estado y vuelve a intentar.' })
    }
    throw fallo
  } finally {
    await session.endSession()
  }
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
    filtro.$or = ['codigo', 'nombreSolicitante', 'correo'].map((campo) =>
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
  await avisarSolicitud(solicitud, 'RECHAZADA')
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
    await avisarSolicitud(await SolicitudCita.findById(req.params.id), 'ATENDIDA')
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
