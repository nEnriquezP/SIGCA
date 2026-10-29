import { Router } from 'express'
import multer from 'multer'
import { autenticar } from '../middleware/autenticacion.js'
import ImagenCargada from '../models/ImagenCargada.js'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import Usuario from '../models/Usuario.js'
import { borrarCargaFallida, descargarImagenPrivada, prepararImagen,
  subirImagen } from '../services/imagenes.js'

const router = Router()
const carga = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024,
  files: 1, fields: 1 } }).single('archivo')
const categorias = new Set(['paciente', 'responsable', 'usuario', 'servicio', 'logo', 'carrusel',
  'publicacion', 'actividad'])

router.use(autenticar)

function accesoImagen(req, categoria, lectura = false) {
  const permiso = {
    paciente: lectura ? 'PACIENTES_VER' : 'PACIENTES_GESTIONAR',
    responsable: lectura ? 'RESPONSABLES_VER' : 'RESPONSABLES_GESTIONAR',
    usuario: null,
    servicio: 'SERVICIOS_GESTIONAR', logo: 'PORTAL_GESTIONAR',
    carrusel: 'PORTAL_GESTIONAR', publicacion: 'PORTAL_GESTIONAR',
    actividad: 'PORTAL_GESTIONAR',
  }[categoria]
  return categoria === 'usuario' || Boolean(permiso && req.permisos?.has(permiso))
}

router.post('/', (req, res, next) => {
  carga(req, res, (error) => {
    if (!error) return next()
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400)
      .json({ mensaje: 'Archivo inválido o demasiado grande (máximo 5 MB)' })
  })
}, async (req, res) => {
  const categoria = req.body?.categoria
  if (!categorias.has(categoria)) return res.status(400).json({ mensaje: 'Categoría de imagen inválida' })
  if (!accesoImagen(req, categoria)) {
    return res.status(403).json({ mensaje: 'Acceso no permitido' })
  }
  if (!req.file) return res.status(400).json({ mensaje: 'Selecciona una imagen' })
  const buffer = await prepararImagen(req.file.buffer)
  const imagen = await subirImagen(buffer, categoria)
  try {
    await ImagenCargada.create({ _id: imagen.id, categoria: imagen.categoria,
      publicId: imagen.publicId, valor: imagen.valor, privada: imagen.privada,
      propietario: categoria === 'usuario' ? req.usuario._id : null })
  } catch (error) {
    await borrarCargaFallida(imagen)
    throw error
  }
  res.status(201).json({ imagen: { valor: imagen.valor } })
})

router.get('/privadas/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store')
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) {
    return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  }
  const imagen = await ImagenCargada.findById(req.params.id)
  if (!imagen?.privada || !['paciente', 'responsable', 'usuario'].includes(imagen.categoria)) {
    return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  }
  if (imagen.categoria === 'usuario' &&
      req.usuario.rol !== 'ADMINISTRADOR' &&
      String(imagen.propietario) !== req.usuario.id) {
    return res.status(403).json({ mensaje: 'Acceso no permitido' })
  }
  if (imagen.categoria !== 'usuario' && !accesoImagen(req, imagen.categoria, true)) {
    return res.status(403).json({ mensaje: 'Acceso no permitido' })
  }
  const asociada = imagen.categoria === 'paciente' ?
    await Paciente.exists({ fotografia: imagen.valor }) :
    imagen.categoria === 'responsable' ?
      await Responsable.exists({ fotografia: imagen.valor }) :
      await Usuario.exists({ _id: imagen.propietario, fotografia: imagen.valor })
  if (!asociada) return res.status(404).json({ mensaje: 'Imagen no encontrada' })
  const buffer = await descargarImagenPrivada(imagen)
  res.set('Content-Type', 'image/jpeg')
  res.set('X-Content-Type-Options', 'nosniff')
  res.send(buffer)
})

export default router
