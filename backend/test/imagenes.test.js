import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Writable } from 'node:stream'
import { v2 as cloudinary } from 'cloudinary'
import mongoose from 'mongoose'
import sharp from 'sharp'
import ImagenCargada from '../src/models/ImagenCargada.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Usuario from '../src/models/Usuario.js'

process.env.JWT_SECRET = randomBytes(32).toString('hex')
process.env.CLOUDINARY_CLOUD_NAME = 'cuenta-de-prueba'
process.env.CLOUDINARY_API_KEY = 'clave-de-prueba'
process.env.CLOUDINARY_API_SECRET = 'secreto-de-prueba'
process.env.CLOUDINARY_FOLDER_PREFIX = 'sigca/test'
mongoose.connection.name = 'sigca_test'

const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')
const imagenes = new Map()
const fotosAsociadas = new Set()
const cargas = []
const usuarios = {
  aaaaaaaaaaaaaaaaaaaaaaaa: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', rol: 'ADMINISTRADOR', activo: true,
    tokenVersion: 0 },
  bbbbbbbbbbbbbbbbbbbbbbbb: { id: 'bbbbbbbbbbbbbbbbbbbbbbbb', rol: 'RECEPCIONISTA', activo: true,
    tokenVersion: 0 },
  cccccccccccccccccccccccc: { id: 'cccccccccccccccccccccccc', rol: 'PROFESIONAL', activo: true,
    tokenVersion: 0 },
}

Usuario.findById = (id) => ({ select: async () => usuarios[String(id)] ?? null })
ImagenCargada.create = async (datos) => { imagenes.set(datos._id, datos); return datos }
ImagenCargada.findById = async (id) => imagenes.get(id) ?? null
Paciente.exists = async ({ fotografia }) => fotosAsociadas.has(fotografia) ? { _id: 'paciente' } : null
Responsable.exists = async ({ fotografia }) => fotosAsociadas.has(fotografia) ? { _id: 'responsable' } : null
cloudinary.uploader.upload_stream = (opciones, respuesta) => {
  const partes = []
  return new Writable({
    write(parte, _codificacion, continuar) { partes.push(parte); continuar() },
    final(continuar) {
      cargas.push({ opciones, buffer: Buffer.concat(partes) })
      respuesta(null, { secure_url: `https://res.cloudinary.com/cuenta-de-prueba/image/${opciones.type}/${opciones.public_id}.jpg` })
      continuar()
    },
  })
}
const fetchReal = global.fetch
global.fetch = (url, opciones) => String(url).startsWith('https://api.cloudinary.com/') ?
  Promise.resolve(new Response(cargas.at(-1)?.buffer, { status: 200,
    headers: { 'content-type': 'image/jpeg' } })) : fetchReal(url, opciones)
cloudinary.utils.private_download_url = () => 'https://api.cloudinary.com/prueba-privada'

const servidor = app.listen(0, '127.0.0.1')
await new Promise((resolver, rechazar) => {
  servidor.once('listening', resolver)
  servidor.once('error', rechazar)
})
const base = `http://127.0.0.1:${servidor.address().port}`

test.after(async () => {
  await new Promise((resolver) => servidor.close(resolver))
  global.fetch = fetchReal
})

async function cargar(categoria, archivo, token, nombre = 'persona-privada.jpg') {
  const datos = new FormData()
  datos.append('categoria', categoria)
  datos.append('archivo', new Blob([archivo], { type: 'image/jpeg' }), nombre)
  const respuesta = await fetch(`${base}/api/imagenes`, { method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {}, body: datos })
  return { status: respuesta.status, body: await respuesta.json() }
}

test('carga controlada, roles y entrega privada simulada', async () => {
  const jpeg = await sharp({ create: { width: 240, height: 180, channels: 3,
    background: '#557799' } }).jpeg().toBuffer()
  const admin = crearToken(usuarios.aaaaaaaaaaaaaaaaaaaaaaaa)
  const recepcion = crearToken(usuarios.bbbbbbbbbbbbbbbbbbbbbbbb)
  const profesional = crearToken(usuarios.cccccccccccccccccccccccc)
  assert.equal((await cargar('paciente', jpeg)).status, 401)
  assert.equal((await cargar('paciente', jpeg, profesional)).status, 403)
  assert.equal((await cargar('servicio', jpeg, recepcion)).status, 403)
  assert.equal((await cargar('paciente', Buffer.from('texto'), recepcion)).status, 400)
  assert.equal((await cargar('paciente', Buffer.alloc(5 * 1024 * 1024 + 1), recepcion)).status, 413)
  const demasiadoAncha = await sharp({ create: { width: 8001, height: 1, channels: 3,
    background: '#557799' } }).jpeg().toBuffer()
  assert.equal((await cargar('paciente', demasiadoAncha, recepcion)).status, 400)
  const privada = await cargar('paciente', jpeg, recepcion)
  assert.equal(privada.status, 201)
  assert.match(privada.body.imagen.valor, /^\/api\/imagenes\/privadas\//)
  assert.equal(cargas.at(-1).opciones.type, 'authenticated')
  assert.match(cargas.at(-1).opciones.public_id, /^sigca\/test\/paciente\/[0-9a-f-]{36}$/)
  assert.equal(cargas.at(-1).opciones.public_id.includes('persona-privada'), false)
  const metadatos = await sharp(cargas.at(-1).buffer).metadata()
  assert.equal(metadatos.format, 'jpeg')
  assert.equal(metadatos.exif, undefined)
  const ruta = privada.body.imagen.valor
  assert.equal((await fetch(`${base}${ruta}`)).status, 401)
  assert.equal((await fetch(`${base}${ruta}`, { headers: {
    Authorization: `Bearer ${profesional}` } })).status, 403)
  assert.equal((await fetch(`${base}${ruta}`, { headers: {
    Authorization: `Bearer ${admin}` } })).status, 404)
  fotosAsociadas.add(ruta)
  const entrega = await fetch(`${base}${ruta}`, { headers: {
    Authorization: `Bearer ${admin}` } })
  assert.equal(entrega.status, 200)
  assert.equal(entrega.headers.get('content-type'), 'image/jpeg')
  assert.equal(entrega.headers.get('cache-control'), 'no-store')
  const publica = await cargar('servicio', jpeg, admin)
  assert.equal(publica.status, 201)
  assert.match(publica.body.imagen.valor, /^https:\/\/res\.cloudinary\.com\//)
  assert.equal(cargas.at(-1).opciones.type, 'upload')
})
