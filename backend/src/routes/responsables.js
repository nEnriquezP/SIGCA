import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import { fotoPrivadaValida } from '../services/imagenes.js'
import { siguienteCodigoResponsable } from '../services/codigosResponsable.js'
import { emitirEnlace } from '../services/correo.js'

const router = Router()
const campos = ['fotografia', 'nombres', 'apellidos', 'parentesco', 'telefono', 'correo', 'direccion']
const longitudes = { fotografia: 500, nombres: 120, apellidos: 120, parentesco: 80,
  telefono: 30, correo: 254, direccion: 300 }

router.use(autenticar, permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'))

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).some((campo) => ![...campos, 'recibirPublicaciones'].includes(campo)) ||
      !campos.every((campo) => campo in datos) ||
      (datos.recibirPublicaciones !== undefined && typeof datos.recibirPublicaciones !== 'boolean')) {
    return 'Debes completar los campos del responsable'
  }
  for (const campo of campos) {
    if (typeof datos[campo] !== 'string' || !datos[campo].trim() ||
        datos[campo].trim().length > longitudes[campo]) return `Revisa ${{
          fotografia: 'la fotografía', nombres: 'los nombres', apellidos: 'los apellidos',
          parentesco: 'el parentesco', telefono: 'el teléfono', correo: 'el correo electrónico',
          direccion: 'la dirección',
        }[campo]}`
  }
  if (!/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(datos.fotografia.trim())) {
    return 'La fotografía debe ser una URL o una ruta que inicie con /'
  }
  if (!/^[1-9][0-9]{7}$/.test(datos.telefono)) {
    return 'El teléfono debe tener 8 dígitos y no comenzar con 0'
  }
  if (!/^[^\s@]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,63}$/.test(datos.correo.trim())) {
    return 'El correo debe tener el formato usuario@dominio.com'
  }
  return null
}

function respuesta(responsable) {
  return { id: responsable.id, codigo: responsable.codigo ?? null,
    fotografia: responsable.fotografia, nombres: responsable.nombres,
    apellidos: responsable.apellidos, parentesco: responsable.parentesco,
    telefono: responsable.telefono, correo: responsable.correo, direccion: responsable.direccion,
    correoVerificado: responsable.correoVerificado === true,
    recibirPublicaciones: responsable.recibirPublicaciones === true }
}

function limpiar(datos) {
  return { ...Object.fromEntries(campos.map((campo) => [campo,
    campo === 'correo' ? datos[campo].trim().toLowerCase() : datos[campo].trim()])),
    ...(datos.recibirPublicaciones !== undefined ? { recibirPublicaciones: datos.recibirPublicaciones } : {}) }
}

function filtroBusqueda(texto) {
  const patron = texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const condiciones = ['codigo', 'nombres', 'apellidos', 'correo', 'telefono'].map((campo) =>
    ({ [campo]: { $regex: patron, $options: 'i' } }))
  if (mongoose.isValidObjectId(texto)) condiciones.push({ _id: texto })
  return { $or: condiciones }
}

router.get('/', async (req, res) => {
  if ((req.query.buscar !== undefined && typeof req.query.buscar !== 'string') ||
      (req.query.pagina !== undefined && !/^(0|[1-9]\d{0,4})$/.test(req.query.pagina))) {
    return res.status(400).json({ mensaje: 'Búsqueda inválida' })
  }
  const buscar = typeof req.query.buscar === 'string' ? req.query.buscar.trim() : ''
  if (buscar.length > 80) return res.status(400).json({ mensaje: 'Búsqueda demasiado larga' })
  const pagina = Number(req.query.pagina ?? 0)
  let consulta = Responsable.find(buscar ? filtroBusqueda(buscar) : {})
    .sort({ apellidos: 1, nombres: 1, _id: 1 })
  if (pagina) consulta = consulta.skip(pagina * 100)
  const responsables = await consulta.limit(101)
  res.json({ responsables: responsables.slice(0, 100).map(respuesta),
    hayMas: responsables.length > 100, pagina })
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
  if (await Responsable.exists({ codigo: null })) {
    return res.status(503).json({ mensaje: 'Primero asigna códigos a los responsables existentes' })
  }
  const codigo = await siguienteCodigoResponsable()
  const responsable = await Responsable.create({ ...limpiar(req.body), codigo })
  const enviado = await emitirEnlace('RESPONSABLE', responsable, 'VERIFICAR')
  res.status(201).json({ responsable: respuesta(responsable), mensaje: enviado ?
    'Responsable registrado. Enviamos un enlace de verificación a su correo.' :
    'Responsable registrado. El enlace no pudo enviarse; solicítalo de nuevo en Verificar correo.' })
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
  const datos = limpiar(req.body)
  if (datos.correo !== actual.correo) datos.correoVerificado = false
  const responsable = await Responsable.findByIdAndUpdate(req.params.id, datos,
    { returnDocument: 'after', runValidators: true })
  if (!responsable) return res.status(404).json({ mensaje: 'Responsable no encontrado' })
  const cambiaCorreo = datos.correo !== actual.correo
  const enviado = cambiaCorreo ? await emitirEnlace('RESPONSABLE', responsable, 'VERIFICAR') : false
  res.json({ responsable: respuesta(responsable), mensaje: !cambiaCorreo ?
    'Responsable actualizado.' : enviado ?
      'Responsable actualizado. Enviamos un enlace de verificación al nuevo correo.' :
      'Responsable actualizado. El enlace no pudo enviarse; solicítalo de nuevo en Verificar correo.' })
})

export default router
