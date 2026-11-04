import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import Servicio from '../src/models/Servicio.js'
import Paciente from '../src/models/Paciente.js'
import Horario, { DIAS } from '../src/models/Horario.js'
import SolicitudCita from '../src/models/SolicitudCita.js'
import CodigoCorreoSolicitud from '../src/models/CodigoCorreoSolicitud.js'
import AvisoCorreo from '../src/models/AvisoCorreo.js'
import Usuario from '../src/models/Usuario.js'
import { ahoraGuatemala } from '../src/services/prepararCita.js'
import { crearSolicitudConCodigo } from '../src/services/codigosSolicitud.js'

process.env.DOTENV_CONFIG_PATH = '/dev/null'
process.env.JWT_SECRET = randomBytes(32).toString('hex')
process.env.RESEND_API_KEY = 'clave-ficticia-local'
process.env.EMAIL_FROM = 'SIGCA <prueba@example.test>'
process.env.APP_PUBLIC_URL = 'http://localhost:5173'
const { default: app } = await import('../src/app.js')
const { crearToken } = await import('../src/middleware/autenticacion.js')
const { procesarAvisos } = await import('../src/services/correo.js')

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))
const enviado = []
const fetchOriginal = globalThis.fetch
let fallarAcuse = false
globalThis.fetch = async (url, opciones) => {
  if (url === 'https://api.resend.com/emails') {
    const cuerpo = JSON.parse(opciones.body)
    enviado.push(cuerpo)
    return new Response(null, { status: fallarAcuse &&
      cuerpo.subject === 'Recibimos tu solicitud de cita' ? 503 : 202 })
  }
  return fetchOriginal(url, opciones)
}

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-solicitudes-correo-'))
  const servidor = createServer()
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar)
    servidor.listen(0, '127.0.0.1', resolver)
  })
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_solicitudes_correo',
    '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  let cliente
  try {
    for (let intento = 0; intento < 60; intento += 1) {
      try {
        cliente = await new mongoose.mongo.MongoClient(
          `mongodb://127.0.0.1:${puerto}/?directConnection=true`,
          { serverSelectionTimeoutMS: 300 }).connect()
        break
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició MongoDB temporal')
        await pausa(100)
      }
    }
    if (!cliente) throw new Error('MongoDB temporal no respondió')
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_solicitudes_correo',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    await mongoose.connect(
      `mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_solicitudes_correo`,
      { serverSelectionTimeoutMS: 10000 })
    return { carpeta, proceso }
  } catch (error) {
    await cliente?.close().catch(() => {})
    if (proceso.exitCode === null) proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

test('código por correo, solicitud verificada y avisos sin usar servicios externos', async (t) => {
  const temporal = await mongoTemporal()
  const servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver) => servidor.once('listening', resolver))
  t.after(async () => {
    globalThis.fetch = fetchOriginal
    await new Promise((resolver) => servidor.close(resolver))
    await mongoose.disconnect()
    if (temporal.proceso.exitCode === null) {
      temporal.proceso.kill('SIGTERM')
      await new Promise((resolver) => temporal.proceso.once('exit', resolver))
    }
    await rm(temporal.carpeta, { recursive: true, force: true })
  })
  const base = `http://127.0.0.1:${servidor.address().port}`
  async function pedir(ruta, datos, token, metodo = 'POST') {
    const respuesta = await fetchOriginal(`${base}${ruta}`, { method: metodo,
      headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(datos) })
    return { status: respuesta.status, body: await respuesta.json() }
  }
  const servicio = await Servicio.create({ codigo: 'SERV-INT-0001',
    nombre: 'Servicio ficticio', descripcion: 'Prueba local', duracionMinutos: 60,
    precioCentavos: 10000, imagen: '/logo.svg' })
  const fecha = new Date(`${ahoraGuatemala().fecha}T12:00:00Z`)
  fecha.setUTCDate(fecha.getUTCDate() + 30)
  const datos = { nombreSolicitante: 'Persona ficticia', correo: 'persona@example.test',
    telefono: '79223344', servicio: servicio.id,
    fechaPreferida: fecha.toISOString().slice(0, 10), mensajeAdicional: '',
    recibirPublicaciones: true }

  assert.equal((await pedir('/api/solicitudes-cita/enviar-codigo',
    { correo: 'persona@dominio' })).status, 400)
  const enviadoCodigo = await pedir('/api/solicitudes-cita/enviar-codigo',
    { correo: datos.correo })
  assert.equal(enviadoCodigo.status, 200)
  assert.match(enviadoCodigo.body.verificacionId, /^[a-f\d]{24}$/)
  const codigo = /cita es (\d{6})/.exec(enviado[0]?.text)?.[1]
  assert.match(codigo, /^\d{6}$/)
  const desafioGuardado = await CodigoCorreoSolicitud.findById(enviadoCodigo.body.verificacionId)
  assert.match(desafioGuardado.hash, /^[0-9a-f]{64}$/)
  assert.equal(desafioGuardado.toObject().codigo, undefined)
  assert.equal((await pedir('/api/solicitudes-cita/enviar-codigo',
    { correo: datos.correo })).status, 429)

  const cuerpo = { ...datos, verificacionId: enviadoCodigo.body.verificacionId,
    codigoVerificacion: codigo }
  assert.equal((await pedir('/api/solicitudes-cita',
    { ...cuerpo, telefono: '01234567' })).status, 400)
  assert.equal((await pedir('/api/solicitudes-cita',
    { ...cuerpo, codigoVerificacion: '000000' })).status, 400)
  assert.equal(await SolicitudCita.countDocuments(), 0)
  fallarAcuse = true
  const creada = await pedir('/api/solicitudes-cita', cuerpo)
  assert.equal(creada.status, 201)
  assert.match(creada.body.solicitud.codigo, /^CONS-CITA-[0-9A-F]{5,24}$/)
  const solicitud = await SolicitudCita.findById(creada.body.solicitud.id)
  assert.equal(solicitud.correoVerificado, true)
  assert.equal(solicitud.recibirPublicaciones, true)
  assert.equal((await CodigoCorreoSolicitud.findById(enviadoCodigo.body.verificacionId)).usado, true)
  assert.equal((await pedir('/api/solicitudes-cita', cuerpo)).status, 400)
  assert.equal(await SolicitudCita.countDocuments(), 1)
  assert.equal(await AvisoCorreo.countDocuments({ estado: 'PENDIENTE' }), 1)
  fallarAcuse = false
  assert.equal((await procesarAvisos()).procesados, 1)
  assert.equal(await AvisoCorreo.countDocuments({ estado: 'ENVIADO' }), 1)
  assert.ok(enviado.some((item) => item.subject === 'Recibimos tu solicitud de cita'))

  const admin = await Usuario.create({ nombre: 'Admin', correo: 'admin@example.test',
    passwordHash: 'hash-ficticio', rol: 'ADMINISTRADOR', correoVerificado: true })
  const rechazo = await pedir(`/api/solicitudes-cita/${solicitud.id}/rechazar`,
    {}, crearToken(admin), 'PATCH')
  assert.equal(rechazo.status, 200)
  assert.equal(rechazo.body.solicitud.estado, 'RECHAZADA')
  assert.ok(enviado.some((item) => item.subject === 'Actualización de tu solicitud de cita'))

  const paciente = await Paciente.create({ codigo: 'PAC-000001', fotografia: '/logo.svg',
    nombres: 'Paciente', apellidos: 'Ficticio', fechaNacimiento: '1990-01-01',
    sexo: 'FEMENINO', telefono: '79223344', correo: 'paciente@example.test',
    correoVerificado: true, direccion: 'Dirección ficticia',
    fechaInicioProceso: ahoraGuatemala().fecha, responsables: [] })
  const profesional = await Usuario.create({ nombre: 'Profesional',
    correo: 'profesional@example.test', passwordHash: 'hash-ficticio',
    rol: 'PROFESIONAL' })
  const diaSemana = new Date(`${datos.fechaPreferida}T12:00:00Z`).getUTCDay()
  await Horario.create({ dia: DIAS[(diaSemana + 6) % 7], activo: true,
    intervalos: [{ horaInicio: '08:00', horaFin: '17:00' }] })
  const segunda = await crearSolicitudConCodigo({ ...datos,
    correo: 'familiar@example.test', correoVerificado: true,
    recibirPublicaciones: false })
  const conversion = await pedir(`/api/solicitudes-cita/${segunda.id}/convertir`, {
    paciente: paciente.id, profesional: profesional.id,
    fecha: datos.fechaPreferida, horaInicio: '10:00',
  }, crearToken(admin))
  assert.equal(conversion.status, 201)
  assert.ok(enviado.some((item) => item.to[0] === 'familiar@example.test' &&
    item.subject === 'Tu solicitud de cita fue atendida' && !item.text.includes('10:00')))
  assert.equal((await procesarAvisos()).procesados, 1)
  assert.ok(enviado.some((item) => item.to[0] === 'paciente@example.test' &&
    item.subject === 'Cita registrada, pendiente de confirmación'))
  assert.equal((await pedir(`/api/citas/${conversion.body.solicitud.cita}/estado`,
    { estado: 'CONFIRMADA' }, crearToken(admin), 'PATCH')).status, 200)
  assert.equal((await procesarAvisos()).procesados, 1)
  assert.ok(enviado.some((item) => item.to[0] === 'paciente@example.test' &&
    item.subject === 'Cita confirmada'))
})
