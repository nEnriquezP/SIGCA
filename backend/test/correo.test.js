import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import TokenCorreo from '../src/models/TokenCorreo.js'
import Usuario from '../src/models/Usuario.js'
import { consumirEnlace, emitirEnlace } from '../src/services/correo.js'

test('el enlace verificado dura seis horas, se usa una sola vez y sigue válido si falla la limpieza anterior', async () => {
  process.env.RESEND_API_KEY = 'solo-prueba'
  process.env.EMAIL_FROM = 'SIGCA <prueba@example.test>'
  process.env.APP_PUBLIC_URL = 'https://example.test/'
  const entidad = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', correo: 'persona@example.test' }
  let guardado
  let mensaje
  let usado = false
  TokenCorreo.create = async (datos) => {
    guardado = { ...datos, _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', usado: false }
    return guardado
  }
  TokenCorreo.updateMany = async () => { throw new Error('Fallo de limpieza simulado') }
  TokenCorreo.findOneAndUpdate = async (filtro) => {
    if (usado || guardado.hash !== filtro.hash || guardado.proposito !== filtro.proposito ||
        guardado.vence <= filtro.vence.$gt) return null
    usado = true
    return { ...guardado, usado: true }
  }
  Usuario.findById = async () => entidad
  globalThis.fetch = async (_url, opciones) => {
    mensaje = JSON.parse(opciones.body)
    return { ok: true }
  }
  assert.equal(await emitirEnlace('USUARIO', entidad, 'VERIFICAR'), true)
  const secreto = /#token=([^\s]+)/.exec(mensaje.texto)[1]
  assert.equal(guardado.hash, createHash('sha256').update(secreto).digest('hex'))
  const horas = (guardado.vence.getTime() - Date.now()) / 3600000
  assert.ok(horas > 5.99 && horas <= 6)
  assert.equal((await consumirEnlace(secreto, 'VERIFICAR')).entidad, entidad)
  assert.equal(await consumirEnlace(secreto, 'VERIFICAR'), null)
  assert.equal(await consumirEnlace(secreto, 'RECUPERAR'), null)
})
