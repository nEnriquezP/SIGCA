import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import { fotoPrivadaValida } from '../services/imagenes.js'

const router = Router()
const campos = ['fotografia', 'nombres', 'apellidos', 'parentesco', 'telefono', 'correo', 'direccion']
const longitudes = { fotografia: 500, nombres: 120, apellidos: 120, parentesco: 80,
  telefono: 30, correo: 254, direccion: 300 }

router.use(autenticar, permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'))

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== campos.length ||
      Object.keys(datos).some((campo) => !campos.includes(campo))) {
    return 'Debes completar los campos del responsable'
  }
  for (const campo of campos) {
    if (typeof datos[campo] !== 'string' || !datos[campo].trim() ||
        datos[campo].trim().length > longitudes[campo]) return `${campo} inválido`
  }
  if (!/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(datos.fotografia.trim())) {
    return 'La fotografía debe ser una URL o una ruta que inicie con /'
  }
  if (!/^\S+@\S+\.\S+$/.test(datos.correo.trim())) return 'Correo inválido'
  return null
}

function respuesta(responsable) {
  return { id: responsable.id, fotografia: responsable.fotografia, nombres: responsable.nombres,
    apellidos: responsable.apellidos, parentesco: responsable.parentesco,
    telefono: responsable.telefono, correo: responsable.correo, direccion: responsable.direccion }
}

function limpiar(datos) {
  return Object.fromEntries(campos.map((campo) => [campo,
    campo === 'correo' ? datos[campo].trim().toLowerCase() : datos[campo].trim()]))
}

function filtroBusqueda(texto) {
  const patron = texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const condiciones = ['nombres', 'apellidos', 'correo', 'telefono'].map((campo) =>
    ({ [campo]: { $regex: patron, $options: 'i' } }))
  if (mongoose.isValidObjectId(texto)) condiciones.push({ _id: texto })
  return { $or: condiciones }
}

router.get('/', async (req, res) => {
  if (req.query.buscar !== undefined && typeof req.query.buscar !== 'string') {
    return res.status(400).json({ mensaje: 'Búsqueda inválida' })
  }
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : ''
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const responsables = await Responsable.find(buscar ? filtroBusqueda(buscar) : {})
    .sort({ apellidos: 1, nombres: 1 }).limit(100)
  res.json({ responsables: responsables.map(respuesta) })
})

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const responsable = await Responsable.findById(req.params.id)
  if (!responsable) return res.status(404).json({ mensaje: 'Responsable no encontrado' })
  const pacientes = await Paciente.find({ responsables: responsable.id })
    .select('codigo nombres apellidos estado').sort({ apellidos: 1, nombres: 1 })
  res.json({ responsable: { ...respuesta(responsable), pacientes: pacientes.map((paciente) => ({
    id: paciente.id, codigo: paciente.codigo ?? null, nombres: paciente.nombres,
    apellidos: paciente.apellidos, estado: paciente.estado,
  })) } })
})

router.post('/', async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  if (!await fotoPrivadaValida(req.body.fotografia.trim(), 'responsable')) {
    return res.status(400).json({ mensaje: 'Carga una fotografía privada para el responsable' })
  }
  const responsable = await Responsable.create(limpiar(req.body))
  res.status(201).json({ responsable: respuesta(responsable) })
})

router.put('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const actual = await Responsable.findById(req.params.id)
  if (!actual) return res.status(404).json({ mensaje: 'Responsable no encontrado' })
  if (!await fotoPrivadaValida(req.body.fotografia.trim(), 'responsable', actual.fotografia)) {
    return res.status(400).json({ mensaje: 'Carga una fotografía privada para el responsable' })
  }
  const responsable = await Responsable.findByIdAndUpdate(req.params.id, limpiar(req.body),
    { returnDocument: 'after', runValidators: true })
  if (!responsable) return res.status(404).json({ mensaje: 'Responsable no encontrado' })
  res.json({ responsable: respuesta(responsable) })
})

export default router
