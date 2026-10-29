import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { v2 as cloudinary } from 'cloudinary'
import mongoose from 'mongoose'
import sharp from 'sharp'
import ImagenCargada from '../models/ImagenCargada.js'

const prefijos = { sigca_dev: 'sigca/dev', sigca_test: 'sigca/test', sigca_prod: 'sigca/prod' }
const privadas = new Set(['paciente', 'responsable', 'usuario'])

export async function fotoPrivadaValida(valor, categoria, anterior = null) {
  if (anterior && valor === anterior) return true
  if (!/^\/api\/imagenes\/privadas\/[0-9a-f-]{36}$/.test(valor)) return false
  return Boolean(await ImagenCargada.exists({ valor, categoria, privada: true }))
}

function errorImagen(mensaje, status = 400) {
  const error = new Error(mensaje)
  error.status = status
  return error
}

function configurar() {
  const { CLOUDINARY_CLOUD_NAME: cloud_name, CLOUDINARY_API_KEY: api_key,
    CLOUDINARY_API_SECRET: api_secret, CLOUDINARY_FOLDER_PREFIX: prefijo } = process.env
  if (!cloud_name || !api_key || !api_secret ||
      prefijo !== prefijos[mongoose.connection.name]) {
    throw errorImagen('Cloudinary no está configurado para esta base de datos', 503)
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true })
  return prefijo
}

function firmaDeImagen(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  return null
}

export async function prepararImagen(buffer) {
  const firma = firmaDeImagen(buffer)
  if (!firma) throw errorImagen('Formato no permitido: usa JPEG, PNG o WebP')
  let metadatos
  try {
    metadatos = await sharp(buffer, { limitInputPixels: 24_000_000 }).metadata()
  } catch {
    throw errorImagen('El archivo no contiene una imagen válida')
  }
  if (metadatos.format !== firma || !metadatos.width || !metadatos.height ||
      metadatos.width > 8000 || metadatos.height > 8000 ||
      metadatos.width * metadatos.height > 24_000_000 || metadatos.pages > 1) {
    throw errorImagen('La imagen excede los límites o no coincide con su formato')
  }
  try {
    return await sharp(buffer, { limitInputPixels: 24_000_000 })
      .rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 }).toBuffer()
  } catch {
    throw errorImagen('No se pudo procesar la imagen')
  }
}

export async function subirImagen(buffer, categoria) {
  const prefijo = configurar()
  const id = randomUUID()
  const privada = privadas.has(categoria)
  const publicId = `${prefijo}/${categoria}/${id}`
  const tipo = privada ? 'authenticated' : 'upload'
  let resultado
  try {
    resultado = await new Promise((resolver, rechazar) => {
      const destino = cloudinary.uploader.upload_stream({ resource_type: 'image', type: tipo,
        public_id: publicId, overwrite: false, unique_filename: false,
        filename_override: 'imagen' }, (error, datos) => error ? rechazar(error) : resolver(datos))
      Readable.from([buffer]).pipe(destino)
    })
  } catch (error) {
    const codigo = Number(error?.http_code)
    console.error('Cloudinary rechazó la carga. Código HTTP:',
      Number.isInteger(codigo) && codigo >= 400 && codigo < 600 ? codigo : 'desconocido')
    throw errorImagen(codigo === 401 ?
      'Cloudinary rechazó las credenciales. Revisa API Key y API Secret en Render.' :
      codigo === 403 ?
        'La clave de Cloudinary no tiene permiso para cargar imágenes.' :
        'Cloudinary no pudo cargar la imagen. Revisa su configuración en Render.', 502)
  }
  const valor = privada ? `/api/imagenes/privadas/${id}` : resultado.secure_url
  if (!valor || valor.length > 500) throw errorImagen('La imagen cargada no tiene una dirección válida', 502)
  return { id, categoria, publicId, privada, valor }
}

export async function borrarCargaFallida(imagen) {
  try {
    await cloudinary.uploader.destroy(imagen.publicId,
      { resource_type: 'image', type: imagen.privada ? 'authenticated' : 'upload' })
  } catch {
    // La carga no se entregó al cliente; se deja para revisión manual si Cloudinary no responde.
  }
}

export async function descargarImagenPrivada(imagen) {
  configurar()
  const enlace = cloudinary.utils.private_download_url(imagen.publicId, 'jpg', {
    resource_type: 'image', type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + 60,
  })
  if (new URL(enlace).hostname !== 'api.cloudinary.com') {
    throw errorImagen('Origen de imagen no válido', 502)
  }
  const respuesta = await fetch(enlace, { redirect: 'error', signal: AbortSignal.timeout(10000) })
  if (!respuesta.ok || !respuesta.headers.get('content-type')?.startsWith('image/')) {
    throw errorImagen('No se pudo obtener la imagen privada', 502)
  }
  const buffer = Buffer.from(await respuesta.arrayBuffer())
  if (buffer.length > 5 * 1024 * 1024) throw errorImagen('Imagen privada demasiado grande', 502)
  return buffer
}
