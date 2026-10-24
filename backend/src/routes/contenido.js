import { Router } from 'express'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import ContenidoInstitucional from '../models/ContenidoInstitucional.js'
import { imagenValida } from '../models/Servicio.js'

const router = Router()
const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const telefonoValido = /^[+\d][\d\s()+.-]{6,29}$/

function texto(valor, maximo) {
  return typeof valor === 'string' && Boolean(valor.trim()) && valor.trim().length <= maximo
}

function clavesExactas(valor, claves) {
  return valor && typeof valor === 'object' && !Array.isArray(valor) &&
    Object.keys(valor).length === claves.length &&
    Object.keys(valor).every((clave) => claves.includes(clave))
}

function validar(datos) {
  if (!clavesExactas(datos, ['nombreCentro', 'logo', 'informacionPrincipal', 'mision',
    'vision', 'carrusel', 'contacto']) ||
      !texto(datos.nombreCentro, 120) || !texto(datos.informacionPrincipal, 2000) ||
      !texto(datos.mision, 2000) || !texto(datos.vision, 2000) ||
      typeof datos.logo !== 'string' || (datos.logo && !imagenValida(datos.logo)) ||
      !Array.isArray(datos.carrusel) ||
      (datos.carrusel.length !== 0 && datos.carrusel.length < 5) ||
      datos.carrusel.length > 10 || !datos.carrusel.every(imagenValida) ||
      !clavesExactas(datos.contacto, ['correo', 'telefono', 'direccion']) ||
      !texto(datos.contacto.correo, 254) || !correoValido.test(datos.contacto.correo.trim()) ||
      !texto(datos.contacto.telefono, 30) || !telefonoValido.test(datos.contacto.telefono.trim()) ||
      !texto(datos.contacto.direccion, 300)) {
    return 'Contenido inválido: completa los datos; el carrusel admite 0 o entre 5 y 10 imágenes'
  }
  return null
}

function respuesta(documento) {
  if (!documento) return null
  return {
    nombreCentro: documento.nombreCentro, logo: documento.logo,
    informacionPrincipal: documento.informacionPrincipal,
    mision: documento.mision, vision: documento.vision,
    carrusel: documento.carrusel, contacto: documento.contacto,
  }
}

router.get('/', async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const contenido = await ContenidoInstitucional.findOne({ clave: 'principal' })
  res.json({ contenido: respuesta(contenido) })
})

router.put('/', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const datos = req.body
  const contenido = await ContenidoInstitucional.findOneAndUpdate({ clave: 'principal' }, {
    $set: {
      nombreCentro: datos.nombreCentro.trim(), logo: datos.logo.trim(),
      informacionPrincipal: datos.informacionPrincipal.trim(),
      mision: datos.mision.trim(), vision: datos.vision.trim(),
      carrusel: datos.carrusel.map((imagen) => imagen.trim()),
      contacto: {
        correo: datos.contacto.correo.trim().toLowerCase(),
        telefono: datos.contacto.telefono.trim(),
        direccion: datos.contacto.direccion.trim(),
      },
    },
    $setOnInsert: { clave: 'principal' },
  }, { upsert: true, returnDocument: 'after', runValidators: true })
  res.json({ contenido: respuesta(contenido) })
})

export default router
