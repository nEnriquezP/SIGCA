import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import Caja from '../src/models/Caja.js'
import Usuario from '../src/models/Usuario.js'
import { crearToken } from '../src/middleware/autenticacion.js'
import { permisosValidos, PERMISOS_PREDEFINIDOS } from '../src/services/permisos.js'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

async function puertoLibre() {
  const servidor = createServer()
  await new Promise((resolver, rechazar) => {
    servidor.once('error', rechazar)
    servidor.listen(0, '127.0.0.1', resolver)
  })
  const puerto = servidor.address().port
  await new Promise((resolver) => servidor.close(resolver))
  return puerto
}

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-cajas-'))
  let proceso
  try {
    const puerto = await puertoLibre()
    proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
      '--bind_ip', '127.0.0.1', '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
    proceso.on('error', () => {})
    for (let intento = 0; intento < 60; intento += 1) {
      try {
        await mongoose.connect(`mongodb://127.0.0.1:${puerto}/sigca_test`,
          { serverSelectionTimeoutMS: 300 })
        assert.equal(mongoose.connection.name, 'sigca_test')
        return { carpeta, proceso }
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició MongoDB temporal')
        await pausa(100)
      }
    }
    throw new Error('MongoDB temporal no respondió')
  } catch (error) {
    await mongoose.disconnect()
    if (proceso?.exitCode === null) proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

async function pedir(base, ruta, credencial, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}),
      ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: datos === undefined ? undefined : JSON.stringify(datos),
  })
  return { status: respuesta.status, body: await respuesta.json(), headers: respuesta.headers }
}

function fechaGuatemala(valor) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(valor))
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.year}-${datos.month}-${datos.day}`
}

test('caja mínima protege apertura y consulta propia con MongoDB temporal local', async (t) => {
  const temporal = await mongoTemporal()
  t.after(async () => {
    await mongoose.disconnect()
    if (temporal.proceso.exitCode === null) {
      temporal.proceso.kill('SIGTERM')
      await new Promise((resolver) => temporal.proceso.once('exit', resolver))
    }
    await rm(temporal.carpeta, { recursive: true, force: true })
  })

  process.env.DOTENV_CONFIG_PATH = '/dev/null'
  process.env.JWT_SECRET = randomBytes(32).toString('hex')
  process.env.CORS_ORIGIN = 'http://localhost:5173'
  const { default: app } = await import('../src/app.js')
  const servidor = app.listen(0, '127.0.0.1')
  await new Promise((resolver, rechazar) => {
    servidor.once('listening', resolver)
    servidor.once('error', rechazar)
  })
  t.after(() => new Promise((resolver) => servidor.close(resolver)))
  const base = `http://127.0.0.1:${servidor.address().port}`

  const [admin, recepcion, otraRecepcion, profesional] = await Usuario.create([
    { nombre: 'Administrador ficticio', correo: 'admin-caja@example.test',
      passwordHash: 'prueba', rol: 'ADMINISTRADOR' },
    { nombre: 'Recepción ficticia', correo: 'recepcion-caja@example.test',
      passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
    { nombre: 'Otra recepción ficticia', correo: 'otra-caja@example.test',
      passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
    { nombre: 'Profesional ficticio', correo: 'profesional-caja@example.test',
      passwordHash: 'prueba', rol: 'PROFESIONAL' },
  ])
  const tokens = { admin: crearToken(admin), recepcion: crearToken(recepcion),
    otraRecepcion: crearToken(otraRecepcion), profesional: crearToken(profesional) }

  await t.test('sin sesión y profesional reciben 401 o 403', async () => {
    assert.equal((await pedir(base, '/api/cajas/actual', null)).status, 401)
    assert.equal((await pedir(base, '/api/cajas/abrir', null, 'POST',
      { montoInicialCentavos: 0 })).status, 401)
    assert.equal((await pedir(base, '/api/cajas/actual', tokens.profesional)).status, 403)
    assert.equal((await pedir(base, '/api/cajas/abrir', tokens.profesional, 'POST',
      { montoInicialCentavos: 0 })).status, 403)
    assert.equal(PERMISOS_PREDEFINIDOS.RECEPCIONISTA.includes('CAJA_VER_PROPIA'), true)
    assert.equal(PERMISOS_PREDEFINIDOS.RECEPCIONISTA.includes('CAJA_ABRIR'), true)
    assert.equal(PERMISOS_PREDEFINIDOS.PROFESIONAL.includes('CAJA_ABRIR'), false)
    assert.equal(permisosValidos(['CAJA_ABRIR']), false)
  })

  await t.test('caja actual inexistente responde sin exponer otra información', async () => {
    const respuesta = await pedir(base, '/api/cajas/actual', tokens.admin)
    assert.equal(respuesta.status, 200)
    assert.deepEqual(respuesta.body, { caja: null })
    assert.equal(respuesta.headers.get('cache-control'), 'no-store')
  })

  await t.test('rechaza monto negativo, tipos inválidos y campos o identificadores ajenos', async () => {
    const invalidos = [
      { montoInicialCentavos: -1 }, { montoInicialCentavos: 1.5 },
      { montoInicialCentavos: '100' }, { montoInicialCentavos: null },
      {}, { montoInicialCentavos: 0, estado: 'ABIERTA' },
      { montoInicialCentavos: 0, usuarioResponsable: 'no-es-un-objectid' },
      { montoInicialCentavos: 0, fechaOperativa: '2020-01-01' },
      { montoInicialCentavos: Number.MAX_SAFE_INTEGER + 1 },
    ]
    for (const datos of invalidos) {
      assert.equal((await pedir(base, '/api/cajas/abrir', tokens.admin, 'POST', datos)).status, 400)
    }
    assert.equal((await pedir(base, '/api/cajas/actual?usuario=no-es-un-objectid',
      tokens.admin)).status, 400)
    assert.equal((await pedir(base, '/api/cajas/abrir?usuario=no-es-un-objectid',
      tokens.admin, 'POST', { montoInicialCentavos: 0 })).status, 400)
    assert.equal(await Caja.countDocuments(), 0)
  })

  await t.test('apertura válida registra fecha de Guatemala, responsable y centavos', async () => {
    const respuesta = await pedir(base, '/api/cajas/abrir', tokens.admin, 'POST',
      { montoInicialCentavos: 12550 })
    assert.equal(respuesta.status, 201)
    const caja = respuesta.body.caja
    assert.ok(mongoose.isValidObjectId(caja.id))
    assert.equal(caja.usuarioResponsable, admin.id)
    assert.equal(caja.estado, 'ABIERTA')
    assert.equal(caja.montoInicialCentavos, 12550)
    assert.equal(caja.revisionMovimientos, 0)
    assert.equal(caja.fechaOperativa, fechaGuatemala(caja.abiertaEn))
    assert.ok(Date.parse(caja.abiertaEn))
    const guardada = await Caja.findById(caja.id)
    assert.equal(guardada.cerradaEn, null)
    assert.equal(guardada.cerradaPor, null)
    const indices = await Caja.collection.listIndexes().toArray()
    assert.ok(indices.some((indice) => indice.name === 'una_caja_abierta_por_usuario' &&
      indice.unique === true && indice.partialFilterExpression?.estado === 'ABIERTA'))
  })

  await t.test('impide una segunda caja abierta al mismo usuario', async () => {
    const segunda = await pedir(base, '/api/cajas/abrir', tokens.admin, 'POST',
      { montoInicialCentavos: 0 })
    assert.equal(segunda.status, 409)
    assert.equal(await Caja.countDocuments({ usuarioResponsable: admin.id, estado: 'ABIERTA' }), 1)
  })

  await t.test('monto cero es válido y cada usuario ve únicamente su caja', async () => {
    const recepcionAbre = await pedir(base, '/api/cajas/abrir', tokens.recepcion, 'POST',
      { montoInicialCentavos: 0 })
    assert.equal(recepcionAbre.status, 201)
    assert.equal(recepcionAbre.body.caja.montoInicialCentavos, 0)
    const vistaAdmin = await pedir(base, '/api/cajas/actual', tokens.admin)
    const vistaRecepcion = await pedir(base, '/api/cajas/actual', tokens.recepcion)
    assert.equal(vistaAdmin.status, 200)
    assert.equal(vistaRecepcion.status, 200)
    assert.equal(vistaAdmin.body.caja.usuarioResponsable, admin.id)
    assert.equal(vistaRecepcion.body.caja.usuarioResponsable, recepcion.id)
    assert.notEqual(vistaAdmin.body.caja.id, vistaRecepcion.body.caja.id)
  })

  await t.test('aperturas simultáneas dejan una sola caja activa', async () => {
    const respuestas = await Promise.all([
      pedir(base, '/api/cajas/abrir', tokens.otraRecepcion, 'POST', { montoInicialCentavos: 0 }),
      pedir(base, '/api/cajas/abrir', tokens.otraRecepcion, 'POST', { montoInicialCentavos: 500 }),
    ])
    assert.deepEqual(respuestas.map((respuesta) => respuesta.status).sort(), [201, 409])
    assert.equal(await Caja.countDocuments({ usuarioResponsable: otraRecepcion.id,
      estado: 'ABIERTA' }), 1)
    const actual = await pedir(base, '/api/cajas/actual', tokens.otraRecepcion)
    assert.equal(actual.status, 200)
    assert.equal(actual.body.caja.usuarioResponsable, otraRecepcion.id)
  })

  await t.test('el cierre requiere datos válidos y la consulta de pagos inicia vacía', async () => {
    const actual = await pedir(base, '/api/cajas/actual', tokens.admin)
    assert.equal((await pedir(base, `/api/cajas/${actual.body.caja.id}/cerrar`,
      tokens.admin, 'PATCH', {})).status, 404)
    assert.equal((await pedir(base, `/api/cajas/${actual.body.caja.id}/cerrar`,
      tokens.admin, 'POST', {})).status, 400)
    const pagos = await pedir(base, '/api/pagos', tokens.admin)
    assert.equal(pagos.status, 200)
    assert.deepEqual(pagos.body.pagos, [])
    assert.equal(pagos.body.total, 0)
  })
})
