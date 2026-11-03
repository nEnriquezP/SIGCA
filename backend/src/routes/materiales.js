import { Router } from 'express'
import mongoose from 'mongoose'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Material, { enlaceMaterialValido } from '../models/Material.js'

const router = Router()
const campos = ['titulo', 'descripcion', 'tipo', 'enlace']
const estados = ['ACTIVO', 'INACTIVO']

function textoValido(valor, maximo) {
  return typeof valor === 'string' && Boolean(valor.trim()) && valor.trim().length <= maximo
}

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== campos.length ||
      Object.keys(datos).some((campo) => !campos.includes(campo)) ||
      !textoValido(datos.titulo, 160) || !textoValido(datos.descripcion, 4000) ||
      !textoValido(datos.tipo, 80) || !enlaceMaterialValido(datos.enlace)) {
    return 'Título, descripción, tipo y enlace válidos son obligatorios'
  }
  return null
}

function limpiar(datos) {
  return Object.fromEntries(campos.map((campo) => [campo, datos[campo].trim()]))
}

function respuesta(material) {
  return {
    id: material.id, titulo: material.titulo, descripcion: material.descripcion,
    tipo: material.tipo, enlace: material.enlace, estado: material.estado,
    fechaRegistro: material.fechaRegistro,
    fechaActualizacion: material.fechaActualizacion,
  }
}

function filtroLista(req) {
  if (Object.keys(req.query).some((campo) => !['buscar', 'tipo', 'estado', 'pagina'].includes(campo)) ||
      (req.query.buscar !== undefined && typeof req.query.buscar !== 'string') ||
      (req.query.tipo !== undefined && typeof req.query.tipo !== 'string') ||
      (req.query.estado !== undefined && typeof req.query.estado !== 'string') ||
      (req.query.pagina !== undefined &&
        (typeof req.query.pagina !== 'string' || !/^(0|[1-9]\d{0,3})$/.test(req.query.pagina)))) {
    return { error: 'Filtros inválidos' }
  }
  const buscar = (req.query.buscar ?? '').trim()
  const tipo = (req.query.tipo ?? '').trim()
  if (buscar.length > 80 || tipo.length > 80 ||
      (req.query.tipo !== undefined && !tipo) ||
      (req.query.estado !== undefined && !estados.includes(req.query.estado))) {
    return { error: 'Filtros inválidos' }
  }
  const administrador = req.usuario.rol === 'ADMINISTRADOR'
  if (!administrador && req.query.estado === 'INACTIVO') {
    return { status: 403, error: 'No puedes consultar materiales inactivos' }
  }
  const filtro = administrador && !req.query.estado ? {} :
    { estado: administrador ? req.query.estado : 'ACTIVO' }
  const escapar = (valor) => valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (tipo) filtro.tipo = { $regex: `^${escapar(tipo)}$`, $options: 'i' }
  if (buscar) {
    const patron = escapar(buscar)
    filtro.$or = ['titulo', 'descripcion'].map((campo) =>
      ({ [campo]: { $regex: patron, $options: 'i' } }))
    if (mongoose.isValidObjectId(buscar)) filtro.$or.push({ _id: buscar })
  }
  return { filtro, pagina: Number(req.query.pagina ?? 0) }
}

router.use(autenticar)

router.get('/', permitirRoles('ADMINISTRADOR', 'PROFESIONAL'), async (req, res) => {
  const { filtro, pagina, status, error } = filtroLista(req)
  if (error) return res.status(status ?? 400).json({ mensaje: error })
  const materiales = await Material.find(filtro)
    .sort({ fechaRegistro: -1, _id: -1 }).skip(pagina * 100).limit(101)
  res.json({ materiales: materiales.slice(0, 100).map(respuesta),
    hayMas: materiales.length > 100, pagina })
})

router.get('/:id', permitirRoles('ADMINISTRADOR', 'PROFESIONAL'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const filtro = { _id: req.params.id }
  if (req.usuario.rol !== 'ADMINISTRADOR') filtro.estado = 'ACTIVO'
  const material = await Material.findOne(filtro)
  if (!material) return res.status(404).json({ mensaje: 'Material no encontrado' })
  res.json({ material: respuesta(material) })
})

router.post('/', permitirRoles('ADMINISTRADOR'), async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const material = await Material.create(limpiar(req.body))
  res.status(201).json({ material: respuesta(material) })
})

router.put('/:id', permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const material = await Material.findByIdAndUpdate(req.params.id, { $set: limpiar(req.body) },
    { returnDocument: 'after', runValidators: true })
  if (!material) return res.status(404).json({ mensaje: 'Material no encontrado' })
  res.json({ material: respuesta(material) })
})

router.patch('/:id/estado', permitirRoles('ADMINISTRADOR'), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ mensaje: 'Identificador inválido' })
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
      Object.keys(req.body).length !== 1 || !estados.includes(req.body.estado)) {
    return res.status(400).json({ mensaje: 'Estado inválido' })
  }
  const material = await Material.findByIdAndUpdate(req.params.id,
    { $set: { estado: req.body.estado } }, { returnDocument: 'after', runValidators: true })
  if (!material) return res.status(404).json({ mensaje: 'Material no encontrado' })
  res.json({ material: respuesta(material) })
})

export default router
