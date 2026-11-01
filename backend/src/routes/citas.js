import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar } from '../middleware/autenticacion.js'
import Cita from '../models/Cita.js'
import ImagenCargada from '../models/ImagenCargada.js'
import Paciente from '../models/Paciente.js'
import Servicio from '../models/Servicio.js'
import Usuario from '../models/Usuario.js'
import { descargarImagenPrivada } from '../services/imagenes.js'
import { errorCita, fechaValida, prepararCita } from '../services/prepararCita.js'
import { avisarCita } from '../services/correo.js'

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
function imagenEnCita(valor, citaId, tipo) {
  if (valor?.startsWith('/api/imagenes/privadas/')) {
    return `/api/citas/${citaId}/imagenes/${tipo}`
  }
  // Las rutas locales antiguas siguen visibles; nunca se entrega un enlace externo directo.
  return typeof valor === 'string' && /^\/imagenes\//.test(valor) ? valor : null
}
function respuestaCita(cita, profesional = false, imagenes = false) {
  return {
    id: cita.id,
    paciente: { id: String(cita.paciente?._id ?? cita.paciente),
      codigo: cita.paciente?.codigo ?? null, nombre: nombrePaciente(cita.paciente),
      ...(imagenes ? { imagen: imagenEnCita(cita.paciente?.fotografia, cita.id, 'paciente') } : {}) },
    servicio: { id: String(cita.servicio?._id ?? cita.servicio),
      nombre: cita.servicio?.nombre ?? 'Servicio no disponible' },
    profesional: { id: String(cita.profesional?._id ?? cita.profesional),
      nombre: cita.profesional?.nombre ?? 'Profesional no disponible',
      ...(imagenes ? { avatar: cita.profesional?.avatar || '',
        imagen: imagenEnCita(cita.profesional?.fotografia, cita.id, 'profesional') } : {}) },
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
  return consulta.populate('paciente', 'codigo nombres apellidos fotografia')
    .populate('servicio', 'nombre').populate('profesional', 'nombre avatar fotografia')
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
  if (Object.keys(req.query).some((campo) => !['buscarPaciente', 'paginaPacientes',
    'pacienteSeleccionado', 'soloPacientes'].includes(campo)) ||
      (req.query.buscarPaciente !== undefined && typeof req.query.buscarPaciente !== 'string') ||
      (req.query.paginaPacientes !== undefined &&
        (typeof req.query.paginaPacientes !== 'string' || !/^(0|[1-9]\d{0,4})$/.test(req.query.paginaPacientes))) ||
      (req.query.pacienteSeleccionado !== undefined && !idValido(req.query.pacienteSeleccionado)) ||
      (req.query.soloPacientes !== undefined && req.query.soloPacientes !== '1')) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const buscar = (req.query.buscarPaciente ?? '').trim()
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const pagina = Number(req.query.paginaPacientes ?? 0)
  const filtroPaciente = { estado: 'ACTIVO' }
  if (buscar) {
    const patron = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filtroPaciente.$or = ['codigo', 'nombres', 'apellidos'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (idValido(buscar)) filtroPaciente.$or.push({ _id: buscar })
  }
  const [pacientes, pacientesTotal, seleccionado] = await Promise.all([
    Paciente.find(filtroPaciente).select('codigo nombres apellidos')
      .sort({ apellidos: 1, nombres: 1, _id: 1 }).skip(pagina * 10).limit(10),
    Paciente.countDocuments(filtroPaciente),
    req.query.pacienteSeleccionado ? Paciente.findOne({ _id: req.query.pacienteSeleccionado,
      estado: 'ACTIVO' }).select('codigo nombres apellidos') : null,
  ])
  const resultado = { pacientes: pacientes.map((p) => ({ id: p.id, codigo: p.codigo ?? null,
    nombre: nombrePaciente(p) })), pacientesTotal, paginaPacientes: pagina,
  pacienteSeleccionado: seleccionado ? { id: seleccionado.id,
    codigo: seleccionado.codigo ?? null, nombre: nombrePaciente(seleccionado) } : null }
  if (req.query.soloPacientes === '1') return res.json(resultado)
  const [servicios, profesionales] = await Promise.all([
    Servicio.find({ estado: 'ACTIVO' }).select('nombre codigo duracionMinutos precioCentavos')
      .sort({ nombre: 1, _id: 1 }),
    Usuario.find({ rol: 'PROFESIONAL', activo: true }).select('nombre avatar fotografia')
      .sort({ nombre: 1, _id: 1 }),
  ])
  res.json({ ...resultado,
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

router.get('/:id/imagenes/:tipo', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (!idValido(req.params.id) || !['paciente', 'profesional'].includes(req.params.tipo)) {
    return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  }
  const filtro = { _id: req.params.id }
  if (!gestor(req)) filtro.profesional = req.usuario._id
  const cita = await Cita.findOne(filtro)
  if (!cita) return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  const persona = req.params.tipo === 'paciente' ?
    await Paciente.findById(cita.paciente).select('fotografia') :
    await Usuario.findById(cita.profesional).select('fotografia')
  const ruta = persona?.fotografia
  const idImagen = /^\/api\/imagenes\/privadas\/([0-9a-f-]{36})$/.exec(ruta || '')?.[1]
  if (!idImagen) return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  const imagen = await ImagenCargada.findById(idImagen)
  const categoria = req.params.tipo === 'paciente' ? 'paciente' : 'usuario'
  if (!imagen?.privada || imagen.categoria !== categoria || imagen.valor !== ruta ||
      (categoria === 'usuario' && String(imagen.propietario) !== String(cita.profesional))) {
    return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  }
  const buffer = await descargarImagenPrivada(imagen)
  res.set('Content-Type', 'image/jpeg')
  res.set('X-Content-Type-Options', 'nosniff')
  res.send(buffer)
})

router.get('/:id', async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador inválido' })
  const filtro = { _id: req.params.id }
  if (!gestor(req)) filtro.profesional = req.usuario._id
  const cita = await poblar(Cita.findOne(filtro))
  if (!cita) return res.status(404).json({ mensaje: 'Cita no encontrada' })
  res.json({ cita: respuestaCita(cita, !gestor(req), true) })
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
    await avisarCita(cita.id, 'PENDIENTE')
    res.status(201).json({ cita: respuestaCita(guardada, false, true) })
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
    await avisarCita(cita.id, 'REPROGRAMADA')
    res.json({ cita: respuestaCita(await poblar(Cita.findById(cita.id)), false, true) })
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
  if (['CONFIRMADA', 'CANCELADA'].includes(destino)) await avisarCita(cita.id, destino)
  res.json({ cita: respuestaCita(await poblar(Cita.findById(cita.id)), profesional, true) })
})

export default router
