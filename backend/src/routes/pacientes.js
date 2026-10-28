import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import { siguienteCodigoPaciente } from '../services/codigosPaciente.js'

const router = Router()
const campos = ['fotografia', 'nombres', 'apellidos', 'fechaNacimiento', 'sexo', 'telefono',
  'direccion', 'fechaInicioProceso', 'observacionesAdministrativas', 'responsables']
const requeridos = campos.filter((campo) => !['observacionesAdministrativas', 'responsables'].includes(campo))
const longitudes = { fotografia: 500, nombres: 120, apellidos: 120, telefono: 30,
  direccion: 300, observacionesAdministrativas: 2000 }
const sexos = new Set(['FEMENINO', 'MASCULINO', 'OTRO', 'PREFIERE_NO_DECIR'])

router.use(autenticar, permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'))

function fechaValida(valor) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const [anio, mes, dia] = valor.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
}

function hoyEnGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const valor = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${valor.year}-${valor.month}-${valor.day}`
}

function edad(fechaNacimiento) {
  const hoy = hoyEnGuatemala()
  let anios = Number(hoy.slice(0, 4)) - Number(fechaNacimiento.slice(0, 4))
  if (hoy.slice(5) < fechaNacimiento.slice(5)) anios -= 1
  return anios
}

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).some((campo) => !campos.includes(campo)) ||
      requeridos.some((campo) => !(campo in datos))) return 'Campos de paciente inválidos'
  for (const [campo, maximo] of Object.entries(longitudes)) {
    const valor = datos[campo] ?? (campo === 'observacionesAdministrativas' ? '' : null)
    if (typeof valor !== 'string' || (campo !== 'observacionesAdministrativas' && !valor.trim()) ||
        valor.trim().length > maximo) return `${campo} inválido`
  }
  if (!/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(datos.fotografia.trim())) {
    return 'La fotografía debe ser una URL o una ruta que inicie con /'
  }
  if (!fechaValida(datos.fechaNacimiento) || datos.fechaNacimiento > hoyEnGuatemala()) {
    return 'Fecha de nacimiento inválida'
  }
  if (!fechaValida(datos.fechaInicioProceso)) return 'Fecha de inicio del proceso inválida'
  if (!sexos.has(datos.sexo)) return 'Sexo inválido'
  if (datos.responsables !== undefined &&
      (!Array.isArray(datos.responsables) || datos.responsables.some((id) =>
        typeof id !== 'string' || !mongoose.isValidObjectId(id)) ||
       new Set(datos.responsables).size !== datos.responsables.length)) {
    return 'Lista de responsables inválida'
  }
  return null
}

async function validarResponsables(ids) {
  if (!ids.length) return true
  return await Responsable.countDocuments({ _id: { $in: ids } }) === ids.length
}

function limpiar(datos) {
  return {
    fotografia: datos.fotografia.trim(), nombres: datos.nombres.trim(),
    apellidos: datos.apellidos.trim(), fechaNacimiento: datos.fechaNacimiento,
    sexo: datos.sexo, telefono: datos.telefono.trim(), direccion: datos.direccion.trim(),
    fechaInicioProceso: datos.fechaInicioProceso,
    observacionesAdministrativas: (datos.observacionesAdministrativas ?? '').trim(),
    responsables: datos.responsables ?? [],
  }
}

function respuesta(paciente) {
  return { id: paciente.id, codigo: paciente.codigo ?? null,
    fotografia: paciente.fotografia, nombres: paciente.nombres,
    apellidos: paciente.apellidos, fechaNacimiento: paciente.fechaNacimiento,
    edad: edad(paciente.fechaNacimiento), sexo: paciente.sexo, telefono: paciente.telefono,
    direccion: paciente.direccion, fechaInicioProceso: paciente.fechaInicioProceso,
    observacionesAdministrativas: paciente.observacionesAdministrativas, estado: paciente.estado,
    responsables: paciente.responsables.map((responsable) =>
      typeof responsable === 'object' && responsable.nombres ? {
        id: responsable.id, nombres: responsable.nombres, apellidos: responsable.apellidos,
        parentesco: responsable.parentesco,
      } : String(responsable)),
  }
}

function filtroBusqueda(texto) {
  const patron = texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const condiciones = ['codigo', 'nombres', 'apellidos', 'telefono'].map((campo) =>
    ({ [campo]: { $regex: patron, $options: 'i' } }))
  if (mongoose.isValidObjectId(texto)) condiciones.push({ _id: texto })
  return { $or: condiciones }
}

router.get('/', async (req, res) => {
  if ((req.query.buscar !== undefined && typeof req.query.buscar !== 'string') ||
      (req.query.estado !== undefined && typeof req.query.estado !== 'string')) {
    return res.status(400).json({ mensaje: 'Filtros inválidos' })
  }
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : ''
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const filtro = buscar ? filtroBusqueda(buscar) : {}
  if (req.query.estado !== undefined) {
    if (!['ACTIVO', 'INACTIVO'].includes(req.query.estado)) {
      return res.status(400).json({ mensaje: 'Estado inválido' })
    }
    filtro.estado = req.query.estado
  }
  const pacientes = await Paciente.find(filtro).sort({ apellidos: 1, nombres: 1 }).limit(100)
  res.json({ pacientes: pacientes.map(respuesta) })
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const paciente = await Paciente.findById(req.params.id).populate('responsables',
    'nombres apellidos parentesco')
  if (!paciente) return res.status(404).json({ mensaje: 'Paciente no encontrado' })
  res.json({ paciente: respuesta(paciente) })
})

router.post('/', async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const datos = limpiar(req.body)
  if (!await validarResponsables(datos.responsables)) {
    return res.status(400).json({ mensaje: 'Uno o varios responsables no existen' })
  }
  if (await Paciente.exists({ codigo: null })) {
    return res.status(503).json({ mensaje: 'Primero deben asignarse códigos a los pacientes existentes' })
  }
  const codigo = await siguienteCodigoPaciente()
  const paciente = await Paciente.create({ ...datos, codigo })
  res.status(201).json({ paciente: respuesta(paciente) })
})

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const datos = limpiar(req.body)
  if (!await validarResponsables(datos.responsables)) {
    return res.status(400).json({ mensaje: 'Uno o varios responsables no existen' })
  }
  const paciente = await Paciente.findByIdAndUpdate(req.params.id, datos,
    { returnDocument: 'after', runValidators: true })
  if (!paciente) return res.status(404).json({ mensaje: 'Paciente no encontrado' })
  res.json({ paciente: respuesta(paciente) })
})

router.patch('/:id/estado', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  if (!req.body || Object.keys(req.body).length !== 1 ||
      !['ACTIVO', 'INACTIVO'].includes(req.body.estado)) {
    return res.status(400).json({ mensaje: 'Estado inválido' })
  }
  const paciente = await Paciente.findByIdAndUpdate(req.params.id,
    { estado: req.body.estado }, { returnDocument: 'after', runValidators: true })
  if (!paciente) return res.status(404).json({ mensaje: 'Paciente no encontrado' })
  res.json({ paciente: respuesta(paciente) })
})

export default router
