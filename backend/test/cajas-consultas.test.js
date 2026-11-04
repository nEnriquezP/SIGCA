import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import Caja from '../src/models/Caja.js'
import Pago from '../src/models/Pago.js'
import Usuario from '../src/models/Usuario.js'
import { crearToken } from '../src/middleware/autenticacion.js'
import { PERMISOS_PREDEFINIDOS } from '../src/services/permisos.js'

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
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-cajas-consultas-'))
  const puerto = await puertoLibre()
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_cajas_consultas',
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
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_cajas_consultas',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    cliente = null
    await mongoose.connect(
      `mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_cajas_consultas`,
      { serverSelectionTimeoutMS: 10000 })
    assert.equal(mongoose.connection.name, 'sigca_test')
    return { carpeta, proceso }
  } catch (error) {
    await cliente?.close().catch(() => {})
    if (proceso.exitCode === null) proceso.kill('SIGTERM')
    await rm(carpeta, { recursive: true, force: true })
    throw error
  }
}

async function pedir(base, ruta, token, metodo = 'GET', datos) {
  const respuesta = await fetch(`${base}${ruta}`, { method: metodo,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(datos === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: datos === undefined ? undefined : JSON.stringify(datos) })
  return { status: respuesta.status, body: await respuesta.json(), headers: respuesta.headers }
}

test('RF-11 consulta cajas y movimientos en MongoDB temporal aislado', async (t) => {
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
  await Promise.all([Caja.init(), Pago.init()])

  const [admin, recepcion, otraRecepcion, profesional] = await Usuario.create([
    { nombre: 'Admin ficticio', correo: 'admin-cajas-consultas@example.test',
      passwordHash: 'prueba', rol: 'ADMINISTRADOR' },
    { nombre: 'Recepción ficticia', correo: 'recepcion-cajas-consultas@example.test',
      passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
    { nombre: 'Otra recepción', correo: 'otra-cajas-consultas@example.test',
      passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
    { nombre: 'Profesional ficticio', correo: 'profesional-cajas-consultas@example.test',
      passwordHash: 'prueba', rol: 'PROFESIONAL' },
  ])
  const tokens = { admin: crearToken(admin), recepcion: crearToken(recepcion),
    otra: crearToken(otraRecepcion), profesional: crearToken(profesional) }
  const cajaRecepcion = await Caja.create({ usuarioResponsable: recepcion.id,
    fechaOperativa: '2026-01-01', abiertaEn: new Date('2026-01-01T23:30:00-06:00'),
    montoInicialCentavos: 10000 })
  const cajaAdmin = await Caja.create({ usuarioResponsable: admin.id,
    fechaOperativa: '2026-01-02', abiertaEn: new Date('2026-01-02T08:00:00-06:00'),
    montoInicialCentavos: 500 })
  const cajaOtra = await Caja.create({ usuarioResponsable: otraRecepcion.id,
    fechaOperativa: '2026-01-02', abiertaEn: new Date('2026-01-02T09:00:00-06:00'),
    montoInicialCentavos: 0 })
  const paciente = new mongoose.Types.ObjectId()
  const cita = new mongoose.Types.ObjectId()
  const movimiento = async (numero, caja, montoCentavos, metodo, estado = 'REGISTRADO') =>
    Pago.create({ numeroComprobante: `PAG-${String(numero).padStart(6, '0')}`,
      paciente, cita, caja: caja.id, montoCentavos, metodo, estado,
      fechaPago: new Date('2026-01-02T00:15:00-06:00'), registradoPor: recepcion.id,
      solicitudId: randomUUID(), ...(estado === 'ANULADO' ? {
        motivoAnulacion: 'Ajuste documentado',
        fechaAnulacion: new Date('2026-01-02T01:00:00-06:00'),
        anuladoPor: admin.id,
      } : {}) })
  const [efectivo, transferencia, tarjeta, anulado] = await Promise.all([
    movimiento(1, cajaRecepcion, 123, 'EFECTIVO'),
    movimiento(2, cajaRecepcion, 456, 'TRANSFERENCIA'),
    movimiento(3, cajaRecepcion, 789, 'TARJETA'),
    movimiento(4, cajaRecepcion, 300, 'EFECTIVO', 'ANULADO'),
  ])
  await movimiento(5, cajaAdmin, 50, 'EFECTIVO')

  await t.test('sesión, rol y filtros no muestran cajas ajenas', async () => {
    assert.equal((await pedir(base, '/api/cajas', null)).status, 401)
    assert.equal((await pedir(base, '/api/cajas', tokens.profesional)).status, 403)
    assert.equal((await pedir(base, `/api/cajas/${cajaRecepcion.id}`,
      tokens.profesional)).status, 403)
    assert.equal((await pedir(base, `/api/cajas/${cajaRecepcion.id}/movimientos`,
      tokens.profesional)).status, 403)
    assert.ok(PERMISOS_PREDEFINIDOS.RECEPCIONISTA.includes('CAJA_HISTORIAL_VER'))
    assert.ok(!PERMISOS_PREDEFINIDOS.PROFESIONAL.includes('CAJA_HISTORIAL_VER'))
    const vistaAdmin = await pedir(base, '/api/cajas', tokens.admin)
    assert.equal(vistaAdmin.status, 200)
    assert.equal(vistaAdmin.body.total, 3)
    const vistaRecepcion = await pedir(base, '/api/cajas', tokens.recepcion)
    assert.equal(vistaRecepcion.body.total, 1)
    assert.equal(vistaRecepcion.body.cajas[0].id, cajaRecepcion.id)
    assert.equal((await pedir(base, `/api/cajas?usuarioResponsable=${admin.id}`,
      tokens.recepcion)).status, 403)
    assert.equal((await pedir(base, `/api/cajas?usuarioResponsable=${recepcion.id}`,
      tokens.admin)).body.total, 1)
    for (const ruta of ['/api/cajas?pagina=-1', '/api/cajas?estado=OTRO',
      '/api/cajas?fechaOperativa=2026-02-30', '/api/cajas?usuarioResponsable=invalido',
      '/api/cajas?otro=1']) {
      assert.equal((await pedir(base, ruta, tokens.admin)).status, 400)
    }
    assert.equal((await pedir(base, '/api/cajas?fechaOperativa=2026-01-01',
      tokens.admin)).body.total, 1)
  })

  await t.test('caja abierta resume métodos y conserva fecha operativa al cruzar medianoche', async () => {
    const actual = await pedir(base, '/api/cajas/actual', tokens.recepcion)
    assert.equal(actual.status, 200)
    assert.equal(actual.body.caja.fechaOperativa, '2026-01-01')
    assert.equal(actual.body.caja.totalEfectivoCentavos, 123)
    assert.equal(actual.body.caja.totalTransferenciaCentavos, 456)
    assert.equal(actual.body.caja.totalTarjetaCentavos, 789)
    assert.equal(actual.body.caja.totalIngresosCentavos, 1368)
    assert.equal(actual.body.caja.efectivoEsperadoCentavos, 10123)
    assert.equal(actual.body.caja.montoInicialCentavos, 10000)
    assert.equal(actual.headers.get('cache-control'), 'no-store')
    const detalle = await pedir(base, `/api/cajas/${cajaRecepcion.id}`, tokens.recepcion)
    assert.equal(detalle.status, 200)
    assert.equal(detalle.body.caja.totalIngresosCentavos, 1368)
  })

  await t.test('detalle y movimientos limitan propietario y conservan anulaciones', async () => {
    const ajena = `/api/cajas/${cajaAdmin.id}`
    const inexistente = `/api/cajas/${new mongoose.Types.ObjectId()}`
    for (const ruta of [ajena, `${ajena}/movimientos`, inexistente,
      `${inexistente}/movimientos`]) {
      assert.equal((await pedir(base, ruta, tokens.recepcion)).status, 404)
    }
    assert.equal((await pedir(base, '/api/cajas/id-invalido', tokens.recepcion)).status, 400)
    assert.equal((await pedir(base, '/api/cajas/id-invalido/movimientos',
      tokens.recepcion)).status, 400)
    assert.equal((await pedir(base, `/api/cajas/${cajaOtra.id}`, tokens.admin)).status, 200)
    const recibidos = await pedir(base, `/api/cajas/${cajaRecepcion.id}/movimientos`,
      tokens.recepcion)
    assert.equal(recibidos.status, 200)
    assert.equal(recibidos.body.total, 4)
    assert.ok(recibidos.body.movimientos.some((pago) => pago.id === efectivo.id))
    assert.ok(recibidos.body.movimientos.some((pago) => pago.id === transferencia.id))
    assert.ok(recibidos.body.movimientos.some((pago) => pago.id === tarjeta.id))
    const cancelado = recibidos.body.movimientos.find((pago) => pago.id === anulado.id)
    assert.equal(cancelado.estado, 'ANULADO')
    assert.equal(cancelado.montoCentavos, 300)
    assert.equal(cancelado.anuladoPor, admin.id)
    assert.ok(cancelado.fechaAnulacion)
    assert.equal(Object.hasOwn(cancelado, 'motivoAnulacion'), false)
    const administracion = await pedir(base,
      `/api/cajas/${cajaRecepcion.id}/movimientos`, tokens.admin)
    assert.equal(administracion.body.movimientos.find((pago) => pago.id === anulado.id)
      .motivoAnulacion, 'Ajuste documentado')
    assert.equal((await pedir(base, `/api/cajas/${cajaRecepcion.id}/movimientos?pagina=-1`,
      tokens.recepcion)).status, 400)
    assert.equal((await pedir(base, `/api/cajas/${cajaRecepcion.id}/movimientos?otro=1`,
      tokens.recepcion)).status, 400)
  })

  await t.test('cierre muestra instantánea y detecta discrepancia sin sobrescribir', async () => {
    const cierre = await pedir(base, `/api/cajas/${cajaRecepcion.id}/cerrar`,
      tokens.recepcion, 'POST', { efectivoContadoCentavos: 10100 })
    assert.equal(cierre.status, 200)
    assert.equal(cierre.body.caja.totalEfectivoCentavos, 123)
    assert.equal(cierre.body.caja.totalIngresosCentavos, 1368)
    assert.equal(cierre.body.caja.efectivoEsperadoCentavos, 10123)
    assert.equal(cierre.body.caja.diferenciaCentavos, -23)
    const detalle = await pedir(base, `/api/cajas/${cajaRecepcion.id}`, tokens.recepcion)
    assert.equal(detalle.status, 200)
    assert.equal(detalle.body.caja.estado, 'CERRADA')
    assert.equal(detalle.body.caja.totalIngresosCentavos, 1368)
    assert.equal(detalle.body.conciliacion.coincide, true)
    assert.equal((await pedir(base, '/api/cajas/actual', tokens.recepcion)).body.caja, null)
    assert.equal((await pedir(base, `/api/cajas/${cajaRecepcion.id}/cerrar`,
      tokens.recepcion, 'POST', { efectivoContadoCentavos: 10100 })).status, 409)
    await Pago.updateOne({ _id: efectivo.id }, { $set: { estado: 'ANULADO' } })
    const discordante = await pedir(base, `/api/cajas/${cajaRecepcion.id}`, tokens.admin)
    assert.equal(discordante.body.caja.totalIngresosCentavos, 1368)
    assert.equal(discordante.body.conciliacion.coincide, false)
    assert.equal(discordante.body.conciliacion.importesCalculadosDeMovimientos
      .totalIngresosCentavos, 1245)
    assert.equal((await Caja.findById(cajaRecepcion.id)).totalIngresosCentavos, 1368)
  })

  await t.test('historial de cierres pagina cincuenta cajas', async () => {
    await Caja.insertMany(Array.from({ length: 51 }, () => ({
      usuarioResponsable: admin.id, fechaOperativa: '2025-01-01',
      estado: 'CERRADA', abiertaEn: new Date('2025-01-01T08:00:00-06:00'),
      montoInicialCentavos: 0, cerradaEn: new Date('2025-01-01T18:00:00-06:00'),
      cerradaPor: admin.id, totalEfectivoCentavos: 0,
      totalTransferenciaCentavos: 0, totalTarjetaCentavos: 0,
      totalIngresosCentavos: 0, efectivoEsperadoCentavos: 0,
      efectivoContadoCentavos: 0, diferenciaCentavos: 0,
    })))
    const primera = await pedir(base,
      '/api/cajas?estado=CERRADA&fechaOperativa=2025-01-01&pagina=0', tokens.admin)
    const segunda = await pedir(base,
      '/api/cajas?estado=CERRADA&fechaOperativa=2025-01-01&pagina=1', tokens.admin)
    assert.equal(primera.status, 200)
    assert.equal(primera.body.total, 51)
    assert.equal(primera.body.cajas.length, 50)
    assert.equal(primera.body.hayMas, true)
    assert.equal(segunda.body.cajas.length, 1)
    assert.equal(segunda.body.hayMas, false)
    assert.equal((await pedir(base, '/api/cajas', tokens.otra)).body.total, 1)
  })

  await t.test('movimientos paginan sin sumar anulados a la caja abierta', async () => {
    await Pago.insertMany(Array.from({ length: 51 }, (_, indice) => ({
      numeroComprobante: `PAG-${String(800000 + indice)}`,
      paciente, cita, caja: cajaOtra.id, montoCentavos: 1,
      metodo: 'TARJETA', estado: 'ANULADO',
      fechaPago: new Date('2026-01-02T10:00:00-06:00'),
      registradoPor: otraRecepcion.id, solicitudId: randomUUID(),
      motivoAnulacion: 'Registro ficticio de paginación',
      fechaAnulacion: new Date('2026-01-02T11:00:00-06:00'),
      anuladoPor: admin.id,
    })))
    const ruta = `/api/cajas/${cajaOtra.id}/movimientos`
    const primera = await pedir(base, `${ruta}?pagina=0`, tokens.otra)
    const segunda = await pedir(base, `${ruta}?pagina=1`, tokens.otra)
    assert.equal(primera.status, 200)
    assert.equal(primera.body.total, 51)
    assert.equal(primera.body.movimientos.length, 50)
    assert.equal(primera.body.hayMas, true)
    assert.equal(segunda.body.movimientos.length, 1)
    assert.equal(segunda.body.hayMas, false)
    assert.equal((await pedir(base, ruta, tokens.recepcion)).status, 404)
    assert.equal((await pedir(base, `/api/cajas/${cajaOtra.id}`, tokens.otra))
      .body.caja.totalIngresosCentavos, 0)
  })
})
