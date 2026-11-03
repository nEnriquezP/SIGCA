import { Router } from 'express'
import mongoose from 'mongoose'
import AsignacionMaterial from '../models/AsignacionMaterial.js'
import Cita from '../models/Cita.js'
import Material from '../models/Material.js'
import Paciente from '../models/Paciente.js'
import { autenticar } from '../middleware/autenticacion.js'

const router = Router()
const estadosVinculo = ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA']

function idValido(valor) {
  return typeof valor === 'string' && mongoose.isValidObjectId(valor)
}

function autorizar(permiso) {
  return (req, res, next) => {
    if (!['ADMINISTRADOR', 'PROFESIONAL'].includes(req.usuario.rol) ||
        !req.permisos.has(permiso)) {
      return res.status(403).json({ mensaje: 'Acceso no permitido' })
    }
    next()
  }
}

function resumenPaciente(paciente) {
  return { id: paciente.id, codigo: paciente.codigo ?? null,
    nombre: `${paciente.nombres} ${paciente.apellidos}`.trim() }
}

function resumenAsignacion(asignacion) {
  const material = asignacion.material
  const asignadoPor = asignacion.asignadoPor
  return { id: asignacion.id,
    material: material ? { id: material.id, titulo: material.titulo,
      descripcion: material.descripcion, tipo: material.tipo,
      enlace: material.enlace, estado: material.estado } : null,
    asignadoPor: asignadoPor ? { id: asignadoPor.id, nombre: asignadoPor.nombre } : null,
    fechaAsignacion: asignacion.fechaAsignacion }
}

async function profesionalVinculado(req, pacienteId) {
  return Boolean(await Cita.exists({ paciente: pacienteId,
    profesional: req.usuario._id, estado: { $in: estadosVinculo } }))
}

router.use(autenticar)

router.get('/opciones', autorizar('MATERIALES_VER'), async (req, res) => {
  if (Object.keys(req.query).some((campo) => !['buscarPaciente', 'paginaPacientes',
    'pacienteSeleccionado', 'soloPacientes'].includes(campo)) ||
      (req.query.buscarPaciente !== undefined && typeof req.query.buscarPaciente !== 'string') ||
      (req.query.paginaPacientes !== undefined &&
        (typeof req.query.paginaPacientes !== 'string' ||
          !/^(0|[1-9]\d{0,4})$/.test(req.query.paginaPacientes))) ||
      (req.query.pacienteSeleccionado !== undefined && !idValido(req.query.pacienteSeleccionado)) ||
      (req.query.soloPacientes !== undefined && req.query.soloPacientes !== '1')) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const buscar = (req.query.buscarPaciente ?? '').trim()
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const pagina = Number(req.query.paginaPacientes ?? 0)
  const esProfesional = req.usuario.rol === 'PROFESIONAL'
  const vinculados = esProfesional ? await Cita.distinct('paciente', {
    profesional: req.usuario._id, estado: { $in: estadosVinculo },
  }) : null
  const filtro = { estado: 'ACTIVO' }
  if (esProfesional) filtro._id = { $in: vinculados }
  if (buscar) {
    const patron = buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filtro.$or = ['codigo', 'nombres', 'apellidos'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (idValido(buscar)) filtro.$or.push({ _id: buscar })
  }
  const seleccionadoId = req.query.pacienteSeleccionado
  const seleccionadoPermitido = seleccionadoId && (!esProfesional ||
    vinculados.some((id) => String(id) === seleccionadoId))
  const [pacientes, pacientesTotal, seleccionado] = await Promise.all([
    Paciente.find(filtro).select('codigo nombres apellidos')
      .sort({ apellidos: 1, nombres: 1, _id: 1 }).skip(pagina * 10).limit(10),
    Paciente.countDocuments(filtro),
    seleccionadoPermitido ? Paciente.findOne({ _id: seleccionadoId, estado: 'ACTIVO' })
      .select('codigo nombres apellidos') : null,
  ])
  res.json({ pacientes: pacientes.map(resumenPaciente), pacientesTotal,
    paginaPacientes: pagina,
    pacienteSeleccionado: seleccionado ? resumenPaciente(seleccionado) : null })
})

router.get('/', autorizar('MATERIALES_VER'), async (req, res) => {
  if (Object.keys(req.query).some((campo) => !['paciente', 'pagina'].includes(campo)) ||
      !idValido(req.query.paciente) ||
      (req.query.pagina !== undefined &&
        (typeof req.query.pagina !== 'string' || !/^(0|[1-9]\d{0,3})$/.test(req.query.pagina)))) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const pacienteId = req.query.paciente
  if (req.usuario.rol === 'PROFESIONAL' && !await profesionalVinculado(req, pacienteId)) {
    return res.status(403).json({ mensaje: 'Acceso no permitido para este paciente' })
  }
  const paciente = await Paciente.findById(pacienteId).select('codigo nombres apellidos')
  if (!paciente) return res.status(404).json({ mensaje: 'Paciente no encontrado' })
  const pagina = Number(req.query.pagina ?? 0)
  const asignaciones = await AsignacionMaterial.find({ paciente: pacienteId })
    .sort({ fechaAsignacion: -1, _id: -1 }).skip(pagina * 100).limit(101)
    .populate('material', 'titulo descripcion tipo enlace estado')
    .populate('asignadoPor', 'nombre')
  res.json({ paciente: resumenPaciente(paciente),
    asignaciones: asignaciones.slice(0, 100).map(resumenAsignacion),
    hayMas: asignaciones.length > 100, pagina })
})

router.post('/', autorizar('MATERIALES_ASIGNAR'), async (req, res) => {
  const datos = req.body
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 ||
      Object.keys(datos).some((campo) => !['material', 'paciente'].includes(campo)) ||
      !idValido(datos.material) || !idValido(datos.paciente)) {
    return res.status(400).json({ mensaje: 'Material y paciente válidos son obligatorios' })
  }
  if (req.usuario.rol === 'PROFESIONAL' && !await profesionalVinculado(req, datos.paciente)) {
    return res.status(403).json({ mensaje: 'Acceso no permitido para este paciente' })
  }
  const [material, paciente] = await Promise.all([
    Material.findById(datos.material), Paciente.findById(datos.paciente).select('estado'),
  ])
  if (!material) return res.status(404).json({ mensaje: 'Material no encontrado' })
  if (!paciente) return res.status(404).json({ mensaje: 'Paciente no encontrado' })
  if (material.estado !== 'ACTIVO') {
    return res.status(409).json({ mensaje: 'El material ya no está activo' })
  }
  if (paciente.estado !== 'ACTIVO') {
    return res.status(409).json({ mensaje: 'El paciente ya no está activo' })
  }
  const session = await mongoose.startSession()
  let asignacion
  try {
    asignacion = await session.withTransaction(async () => {
      // Ambas escrituras fuerzan un conflicto si se desactiva un registro en paralelo.
      const materialActivo = await Material.updateOne(
        { _id: material._id, estado: 'ACTIVO' }, { $inc: { __v: 1 } }, { session })
      if (materialActivo.matchedCount !== 1) {
        const error = new Error('El material ya no está activo')
        error.status = 409
        throw error
      }
      const pacienteActivo = await Paciente.updateOne(
        { _id: paciente._id, estado: 'ACTIVO' }, { $inc: { __v: 1 } }, { session })
      if (pacienteActivo.matchedCount !== 1) {
        const error = new Error('El paciente ya no está activo')
        error.status = 409
        throw error
      }
      const [creada] = await AsignacionMaterial.create([{ material: material._id,
        paciente: paciente._id, asignadoPor: req.usuario._id }], { session })
      return creada
    })
  } catch (error) {
    if (error.code === 112 || error.hasErrorLabel?.('TransientTransactionError')) {
      return res.status(409).json({ mensaje: 'El paciente o material cambió durante la asignación. Vuelve a intentar.' })
    }
    throw error
  } finally {
    await session.endSession()
  }
  res.status(201).json({ asignacion: { id: asignacion.id,
    material: String(asignacion.material), paciente: String(asignacion.paciente),
    asignadoPor: String(asignacion.asignadoPor),
    fechaAsignacion: asignacion.fechaAsignacion } })
})

export default router
