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
import Cita from '../src/models/Cita.js'
import Pago from '../src/models/Pago.js'
import Paciente from '../src/models/Paciente.js'
import Usuario from '../src/models/Usuario.js'
import { crearToken } from '../src/middleware/autenticacion.js'
import { PERMISOS_PREDEFINIDOS } from '../src/services/permisos.js'

const pausa = (ms) => new Promise((resolver) => setTimeout(resolver, ms))

function fechaGuatemala(valor) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(valor))
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.year}-${datos.month}-${datos.day}`
}

async function mongoTemporal() {
  const carpeta = await mkdtemp(join(tmpdir(), 'sigca-pagos-'))
  const s = createServer()
  await new Promise((resolver, rechazar) => {
    s.once('error', rechazar)
    s.listen(0, '127.0.0.1', resolver)
  })
  const puerto = s.address().port
  await new Promise((resolver) => s.close(resolver))
  const proceso = spawn('mongod', ['--dbpath', carpeta, '--port', String(puerto),
    '--bind_ip', '127.0.0.1', '--replSet', 'sigca_pagos_prueba',
    '--logpath', join(carpeta, 'mongod.log')], { stdio: 'ignore' })
  proceso.on('error', () => {})
  let cliente
  try {
    for (let i = 0; i < 60; i += 1) {
      try {
        cliente = await new mongoose.mongo.MongoClient(
          `mongodb://127.0.0.1:${puerto}/?directConnection=true`,
          { serverSelectionTimeoutMS: 300 }).connect()
        break
      } catch {
        if (proceso.exitCode !== null) throw new Error('No inició mongod temporal')
        await pausa(100)
      }
    }
    if (!cliente) throw new Error('MongoDB temporal no respondió')
    await cliente.db('admin').command({ replSetInitiate: { _id: 'sigca_pagos_prueba',
      members: [{ _id: 0, host: `127.0.0.1:${puerto}` }] } })
    await cliente.close()
    cliente = null
    await mongoose.connect(
      `mongodb://127.0.0.1:${puerto}/sigca_test?replicaSet=sigca_pagos_prueba`,
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
  return { status: respuesta.status, body: await respuesta.json() }
}

test('pagos y cierre financiero con réplica MongoDB temporal local', async (t) => {
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
  await Promise.all([Cita.init(), Caja.init(), Pago.init()])

  const [admin, recepcion, profesional, adminRevision] = await Usuario.create([
    { nombre: 'Admin ficticio', correo: 'admin-pagos@example.test',
      passwordHash: 'prueba', rol: 'ADMINISTRADOR' },
    { nombre: 'Recepción ficticia', correo: 'recepcion-pagos@example.test',
      passwordHash: 'prueba', rol: 'RECEPCIONISTA' },
    { nombre: 'Profesional ficticio', correo: 'profesional-pagos@example.test',
      passwordHash: 'prueba', rol: 'PROFESIONAL' },
    { nombre: 'Revisión ficticia', correo: 'revision-pagos@example.test',
      passwordHash: 'prueba', rol: 'ADMINISTRADOR' },
  ])
  const adminToken = crearToken(admin)
  const recepcionToken = crearToken(recepcion)
  const profesionalToken = crearToken(profesional)
  const revisionToken = crearToken(adminRevision)
  const pacienteId = new mongoose.Types.ObjectId()
  await Paciente.create({ _id: pacienteId, codigo: 'PAC-000001',
    fotografia: '/imagenes/prueba.jpg', nombres: 'Paciente', apellidos: 'Ficticio',
    fechaNacimiento: '2000-01-01', sexo: 'FEMENINO', telefono: '55551234',
    direccion: 'Dirección ficticia', fechaInicioProceso: '2026-01-01', responsables: [] })
  const nuevaCita = async (precioCentavos, estado = 'PENDIENTE') => Cita.create({
    paciente: pacienteId, servicio: new mongoose.Types.ObjectId(),
    profesional: new mongoose.Types.ObjectId(), fecha: '2026-12-01',
    horaInicio: '10:00', horaFin: '10:01', minutosOcupados: [600],
    duracionMinutos: 1, precioCentavos, estado,
  })
  const datosPago = (cita, montoCentavos, metodo = 'EFECTIVO') =>
    ({ cita: cita.id, montoCentavos, metodo, solicitudId: randomUUID() })
  const pagar = (token, datos) => pedir(base, '/api/pagos', token, 'POST', datos)
  const pagarEstable = async (token, datos) => {
    let respuesta
    for (let intento = 0; intento < 5; intento += 1) {
      respuesta = await pagar(token, datos)
      if (respuesta.status !== 409 ||
          !respuesta.body.mensaje?.startsWith('Conflicto de pago')) return respuesta
      await pausa(20)
    }
    return respuesta
  }
  const abrir = (token, montoInicialCentavos) => pedir(base, '/api/cajas/abrir', token,
    'POST', { montoInicialCentavos })
  const cerrar = (token, cajaId, efectivoContadoCentavos) => pedir(base,
    `/api/cajas/${cajaId}/cerrar`, token, 'POST', { efectivoContadoCentavos })

  await t.test('permisos y validaciones estrictas', async () => {
    const cita = await nuevaCita(1001)
    const datos = datosPago(cita, 1)
    assert.equal((await pagar(null, datos)).status, 401)
    assert.equal((await pagar(profesionalToken, datos)).status, 403)
    assert.equal((await cerrar(profesionalToken, new mongoose.Types.ObjectId(), 0)).status, 403)
    assert.ok(PERMISOS_PREDEFINIDOS.ADMINISTRADOR.includes('PAGOS_ANULAR'))
    assert.ok(!PERMISOS_PREDEFINIDOS.RECEPCIONISTA.includes('PAGOS_ANULAR'))
    assert.ok(!PERMISOS_PREDEFINIDOS.PROFESIONAL.includes('PAGOS_REGISTRAR'))
    for (const monto of [0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
      assert.equal((await pagar(adminToken, { ...datos, montoCentavos: monto })).status, 400)
    }
    for (const cambio of [{ metodo: 'OTRO' }, { solicitudId: 'mala' },
      { cita: 'mala' }, { paciente: String(pacienteId) }, { estado: 'ANULADO' }]) {
      assert.equal((await pagar(adminToken, { ...datos, ...cambio })).status, 400)
    }
    assert.equal((await pagar(adminToken, datos)).status, 409)
    assert.equal(await Pago.countDocuments(), 0)
  })

  const cajaAdmin = (await abrir(adminToken, 12550)).body.caja
  const cajaRecepcion = (await abrir(recepcionToken, 0)).body.caja
  assert.ok(cajaAdmin?.id && cajaRecepcion?.id)

  await t.test('abonos, saldo, comprobantes, idempotencia y caja propia', async () => {
    const cita = await nuevaCita(1001)
    const primero = datosPago(cita, 1)
    const guardado = await pagarEstable(adminToken, primero)
    assert.equal(guardado.status, 201, JSON.stringify(guardado.body))
    assert.match(guardado.body.pago.numeroComprobante, /^PAG-\d{6,}$/)
    assert.equal(guardado.body.pago.paciente, String(pacienteId))
    assert.equal(guardado.body.pago.caja, cajaAdmin.id)
    assert.equal(guardado.body.pago.registradoPor, admin.id)
    assert.equal((await pagar(adminToken, primero)).body.pago.id, guardado.body.pago.id)
    assert.equal((await pagar(adminToken, primero)).body.repetido, true)
    assert.equal((await pagar(adminToken, { ...primero,
      solicitudId: primero.solicitudId.toUpperCase() })).body.pago.id, guardado.body.pago.id)
    assert.equal((await pagar(adminToken, { ...primero, montoCentavos: 2 })).status, 409)
    assert.equal((await pagar(recepcionToken, primero)).status, 409)
    const segundo = await pagarEstable(adminToken, datosPago(cita, 1000))
    assert.equal(segundo.status, 201, JSON.stringify(segundo.body))
    assert.notEqual(segundo.body.pago.numeroComprobante, guardado.body.pago.numeroComprobante)
    assert.equal((await pagar(adminToken, datosPago(cita, 1))).status, 409)
    assert.equal(await Pago.countDocuments({ cita: cita._id, estado: 'REGISTRADO' }), 2)
  })

  await t.test('cita inexistente, cancelada e histórica', async () => {
    const inexistente = { cita: String(new mongoose.Types.ObjectId()),
      montoCentavos: 1, metodo: 'EFECTIVO', solicitudId: randomUUID() }
    assert.equal((await pagar(adminToken, inexistente)).status, 404)
    const cancelada = await nuevaCita(100, 'CANCELADA')
    assert.equal((await pagar(adminToken, datosPago(cancelada, 1))).status, 409)
    const historica = await nuevaCita(100, 'COMPLETADA')
    assert.equal((await pagarEstable(adminToken, datosPago(historica, 100))).status, 201)
    const legado = await nuevaCita(100, 'COMPLETADA')
    await Cita.collection.updateOne({ _id: legado._id },
      { $unset: { revisionFinanciera: '' } })
    assert.equal((await pagarEstable(adminToken, datosPago(legado, 100))).status, 201)
  })

  await t.test('RN-27 y pago contra cancelación simultánea', async () => {
    const citaPagada = await nuevaCita(100)
    assert.equal((await pagarEstable(recepcionToken, datosPago(citaPagada, 1))).status, 201)
    assert.equal((await pedir(base, `/api/citas/${citaPagada.id}/estado`, adminToken,
      'PATCH', { estado: 'CANCELADA' })).status, 409)
    const sinPago = await nuevaCita(100)
    assert.equal((await pedir(base, `/api/citas/${sinPago.id}/estado`, adminToken,
      'PATCH', { estado: 'CANCELADA' })).status, 200)
    assert.equal((await pagar(recepcionToken, datosPago(sinPago, 1))).status, 409)
    const soloAnulado = await nuevaCita(100)
    await Pago.create({ numeroComprobante: 'PAG-999999', paciente: pacienteId,
      cita: soloAnulado._id, caja: cajaRecepcion.id, montoCentavos: 1,
      metodo: 'EFECTIVO', registradoPor: recepcion._id,
      estado: 'ANULADO', solicitudId: randomUUID() })
    assert.equal((await pedir(base, `/api/citas/${soloAnulado.id}/estado`, adminToken,
      'PATCH', { estado: 'CANCELADA' })).status, 200)
    const carrera = await nuevaCita(100)
    const respuestas = await Promise.all([
      pagar(recepcionToken, datosPago(carrera, 1)),
      pedir(base, `/api/citas/${carrera.id}/estado`, adminToken,
        'PATCH', { estado: 'CANCELADA' }),
    ])
    assert.ok(respuestas.every((r) => [200, 201, 409].includes(r.status)))
    const final = await Cita.findById(carrera.id)
    const pagos = await Pago.countDocuments({ cita: carrera._id, estado: 'REGISTRADO' })
    assert.ok(!(final.estado === 'CANCELADA' && pagos > 0))
  })

  await t.test('abonos simultáneos nunca superan el precio', async () => {
    const cita = await nuevaCita(1000)
    const respuestas = await Promise.all([
      pagar(recepcionToken, datosPago(cita, 700)),
      pagar(recepcionToken, datosPago(cita, 700)),
    ])
    assert.deepEqual(respuestas.map((r) => r.status).sort(), [201, 409])
    const pagos = await Pago.find({ cita: cita._id, estado: 'REGISTRADO' })
    assert.equal(pagos.length, 1)
    assert.equal(pagos[0].montoCentavos, 700)
    const mismaClave = await nuevaCita(100)
    const solicitud = datosPago(mismaClave, 100)
    const duplicados = await Promise.all([
      pagar(recepcionToken, solicitud), pagar(recepcionToken, solicitud),
    ])
    assert.ok(duplicados.every((r) => [200, 201, 409].includes(r.status)))
    const reintento = await pagarEstable(recepcionToken, solicitud)
    assert.ok([200, 201].includes(reintento.status))
    assert.equal(await Pago.countDocuments({ solicitudId: solicitud.solicitudId }), 1)
  })

  await t.test('consultas, filtros, saldo derivado, permisos y anulación auditada', async () => {
    const cajaRevision = (await abrir(revisionToken, 0)).body.caja
    const cita = await nuevaCita(1001)
    const rutaSaldo = `/api/citas/${cita.id}/saldo`
    const rutaHistorial = `/api/citas/${cita.id}/pagos`
    assert.equal((await pedir(base, '/api/pagos', null)).status, 401)
    assert.equal((await pedir(base, '/api/pagos', profesionalToken)).status, 403)
    assert.equal((await pedir(base, rutaSaldo, profesionalToken)).status, 403)
    assert.equal((await pedir(base, '/api/pagos?pagina=-1', revisionToken)).status, 400)
    assert.equal((await pedir(base, '/api/pagos?fecha=2026-02-30', revisionToken)).status, 400)
    assert.equal((await pedir(base, '/api/pagos?paciente=invalido', revisionToken)).status, 400)
    assert.equal((await pedir(base, `/api/pagos/${new mongoose.Types.ObjectId()}`,
      revisionToken)).status, 404)
    assert.equal((await pedir(base, rutaSaldo, revisionToken)).body.saldo.estadoFinanciero,
      'PENDIENTE')
    const primero = await pagarEstable(revisionToken, datosPago(cita, 400))
    assert.equal(primero.status, 201)
    assert.equal((await pedir(base, rutaSaldo, revisionToken)).body.saldo.estadoFinanciero,
      'PARCIAL')
    const segundo = await pagarEstable(revisionToken, datosPago(cita, 601, 'TRANSFERENCIA'))
    assert.equal(segundo.status, 201)
    const completo = (await pedir(base, rutaSaldo, revisionToken)).body.saldo
    assert.equal(completo.precioCentavos, 1001)
    assert.equal(completo.totalPagadoCentavos, 1001)
    assert.equal(completo.saldoPendienteCentavos, 0)
    assert.equal(completo.estadoFinanciero, 'PAGADO')
    const historial = await pedir(base, rutaHistorial, recepcionToken)
    assert.equal(historial.status, 200)
    assert.equal(historial.body.total, 2)
    assert.equal((await pedir(base, `${rutaHistorial}?pagina=mal`, revisionToken)).status, 400)
    const filtrados = await pedir(base,
      `/api/pagos?paciente=${pacienteId}&metodo=TRANSFERENCIA`, revisionToken)
    assert.equal(filtrados.status, 200)
    assert.ok(filtrados.body.pagos.some((pago) => pago.id === segundo.body.pago.id))
    const porFecha = await pedir(base,
      `/api/pagos?fecha=${fechaGuatemala(primero.body.pago.fechaPago)}`, revisionToken)
    assert.equal(porFecha.status, 200)
    assert.ok(porFecha.body.pagos.some((pago) => pago.id === primero.body.pago.id))
    const detalle = await pedir(base, `/api/pagos/${primero.body.pago.id}`, revisionToken)
    assert.equal(detalle.status, 200)
    assert.equal(detalle.body.pago.paciente, String(pacienteId))
    assert.equal(detalle.body.pago.pacienteNombre, 'Paciente Ficticio')
    assert.equal((await pedir(base, `/api/pagos/${primero.body.pago.id}/anular`,
      recepcionToken, 'PATCH', { motivo: 'Corrección' })).status, 403)
    assert.equal((await pedir(base, `/api/pagos/${primero.body.pago.id}/anular`,
      revisionToken, 'PATCH', { motivo: '   ' })).status, 400)
    const anulado = await pedir(base, `/api/pagos/${primero.body.pago.id}/anular`,
      revisionToken, 'PATCH', { motivo: 'Cobro duplicado' })
    assert.equal(anulado.status, 200)
    assert.equal(anulado.body.pago.estado, 'ANULADO')
    assert.equal(anulado.body.pago.motivoAnulacion, 'Cobro duplicado')
    assert.ok(anulado.body.pago.fechaAnulacion)
    assert.equal(anulado.body.pago.anuladoPor, adminRevision.id)
    assert.equal((await pedir(base, `/api/pagos/${primero.body.pago.id}/anular`,
      revisionToken, 'PATCH', { motivo: 'Otra vez' })).status, 409)
    const nuevoSaldo = (await pedir(base, rutaSaldo, revisionToken)).body.saldo
    assert.equal(nuevoSaldo.totalPagadoCentavos, 601)
    assert.equal(nuevoSaldo.saldoPendienteCentavos, 400)
    assert.equal(nuevoSaldo.estadoFinanciero, 'PARCIAL')
    const recepcionVe = await pedir(base, `/api/pagos/${primero.body.pago.id}`,
      recepcionToken)
    assert.equal(recepcionVe.body.pago.estado, 'ANULADO')
    assert.equal(Object.hasOwn(recepcionVe.body.pago, 'motivoAnulacion'), false)
    assert.equal((await pedir(base, `/api/citas/${cita.id}/estado`, revisionToken,
      'PATCH', { estado: 'CANCELADA' })).status, 409)
    assert.equal((await pedir(base, `/api/pagos/${segundo.body.pago.id}/anular`,
      revisionToken, 'PATCH', { motivo: 'Reversión documentada' })).status, 200)
    assert.equal((await pedir(base, rutaSaldo, revisionToken)).body.saldo.estadoFinanciero,
      'PENDIENTE')
    assert.equal((await pedir(base, `/api/citas/${cita.id}/estado`, revisionToken,
      'PATCH', { estado: 'CANCELADA' })).status, 200)
    const pagoCerrado = await pagarEstable(revisionToken, datosPago(await nuevaCita(100), 100))
    assert.equal(pagoCerrado.status, 201)
    assert.equal((await cerrar(revisionToken, cajaRevision.id, 100)).status, 200)
    assert.equal((await pedir(base, `/api/pagos/${pagoCerrado.body.pago.id}/anular`,
      revisionToken, 'PATCH', { motivo: 'Caja cerrada' })).status, 409)
  })

  await t.test('anulación simultánea con cierre y cancelación conserva invariantes', async () => {
    const cajaRevision = (await abrir(revisionToken, 0)).body.caja
    const cita = await nuevaCita(100)
    const pago = await pagarEstable(revisionToken, datosPago(cita, 100))
    assert.equal(pago.status, 201)
    const respuestas = await Promise.all([
      pedir(base, `/api/pagos/${pago.body.pago.id}/anular`, revisionToken,
        'PATCH', { motivo: 'Revisión simultánea' }),
      cerrar(revisionToken, cajaRevision.id, 100),
    ])
    assert.ok(respuestas.every((r) => [200, 409].includes(r.status)))
    const cajaFinal = await Caja.findById(cajaRevision.id)
    const pagoFinal = await Pago.findById(pago.body.pago.id)
    if (cajaFinal.estado === 'CERRADA') {
      assert.equal(cajaFinal.totalEfectivoCentavos,
        pagoFinal.estado === 'REGISTRADO' ? 100 : 0)
    }
    if (cajaFinal.estado === 'ABIERTA') {
      assert.equal((await cerrar(revisionToken, cajaRevision.id,
        pagoFinal.estado === 'REGISTRADO' ? 100 : 0)).status, 200)
    }
    const otraCaja = (await abrir(revisionToken, 0)).body.caja
    const otraCita = await nuevaCita(100)
    const otroPago = await pagarEstable(revisionToken, datosPago(otraCita, 100))
    const carreras = await Promise.all([
      pedir(base, `/api/pagos/${otroPago.body.pago.id}/anular`, revisionToken,
        'PATCH', { motivo: 'Anulación concurrente' }),
      pedir(base, `/api/citas/${otraCita.id}/estado`, revisionToken,
        'PATCH', { estado: 'CANCELADA' }),
    ])
    assert.ok(carreras.every((r) => [200, 409].includes(r.status)))
    const citaFinal = await Cita.findById(otraCita.id)
    const validos = await Pago.countDocuments({ cita: otraCita.id, estado: 'REGISTRADO' })
    assert.ok(!(citaFinal.estado === 'CANCELADA' && validos > 0))
    const cajaAbierta = await Caja.findById(otraCaja.id)
    assert.equal(cajaAbierta.estado, 'ABIERTA')
    const citaPagos = await nuevaCita(1000)
    const pagoPrevio = await pagarEstable(revisionToken, datosPago(citaPagos, 700))
    const simultaneos = await Promise.all([
      pedir(base, `/api/pagos/${pagoPrevio.body.pago.id}/anular`, revisionToken,
        'PATCH', { motivo: 'Ajuste de abono' }),
      pagar(revisionToken, datosPago(citaPagos, 700)),
    ])
    assert.ok(simultaneos.every((r) => [200, 201, 409].includes(r.status)))
    const saldo = (await pedir(base, `/api/citas/${citaPagos.id}/saldo`, revisionToken)).body.saldo
    assert.ok(saldo.totalPagadoCentavos <= 1000)
  })

  await t.test('la consulta de pagos pagina cincuenta registros por página', async () => {
    const cita = await nuevaCita(100)
    const caja = await Caja.findOne({ usuarioResponsable: adminRevision.id })
    await Pago.insertMany(Array.from({ length: 51 }, (_, indice) => ({
      numeroComprobante: `PAG-${String(900000 + indice)}`,
      paciente: pacienteId, cita: cita.id, caja: caja.id,
      montoCentavos: 1, metodo: 'TARJETA', estado: 'ANULADO',
      fechaPago: new Date('2025-01-01T12:00:00Z'),
      registradoPor: adminRevision.id, solicitudId: randomUUID(),
      motivoAnulacion: 'Registro ficticio para paginación',
      fechaAnulacion: new Date('2025-01-01T13:00:00Z'), anuladoPor: adminRevision.id,
    })))
    const primera = await pedir(base, '/api/pagos?fecha=2025-01-01&pagina=0', revisionToken)
    const segunda = await pedir(base, '/api/pagos?fecha=2025-01-01&pagina=1', revisionToken)
    assert.equal(primera.status, 200)
    assert.equal(primera.body.total, 51)
    assert.equal(primera.body.pagos.length, 50)
    assert.equal(primera.body.hayMas, true)
    assert.equal(segunda.body.pagos.length, 1)
    assert.equal(segunda.body.hayMas, false)
  })

  await t.test('cierre suma métodos, registra diferencia y bloquea nuevos pagos', async () => {
    const cita = await nuevaCita(4000)
    assert.equal((await pagarEstable(adminToken, datosPago(cita, 1000, 'TRANSFERENCIA'))).status, 201)
    assert.equal((await pagarEstable(adminToken, datosPago(cita, 2000, 'TARJETA'))).status, 201)
    assert.equal((await pagarEstable(adminToken, datosPago(cita, 1000, 'EFECTIVO'))).status, 201)
    assert.equal((await cerrar(recepcionToken, cajaAdmin.id, 0)).status, 404)
    assert.equal((await pedir(base, `/api/cajas/${cajaAdmin.id}/cerrar`, adminToken,
      'POST', { efectivoContadoCentavos: -1 })).status, 400)
    const cierre = await cerrar(adminToken, cajaAdmin.id, 14550)
    assert.equal(cierre.status, 200)
    assert.equal(cierre.body.caja.totalEfectivoCentavos, 2201)
    assert.equal(cierre.body.caja.totalTransferenciaCentavos, 1000)
    assert.equal(cierre.body.caja.totalTarjetaCentavos, 2000)
    assert.equal(cierre.body.caja.totalIngresosCentavos, 5201)
    assert.equal(cierre.body.caja.efectivoEsperadoCentavos, 14751)
    assert.equal(cierre.body.caja.diferenciaCentavos, -201)
    assert.equal(cierre.body.caja.cerradaPor, admin.id)
    assert.equal((await cerrar(adminToken, cajaAdmin.id, 0)).status, 409)
    assert.equal((await pagar(adminToken, datosPago(await nuevaCita(100), 1))).status, 409)
    assert.equal((await pagar(adminToken, {
      cita: cita.id, montoCentavos: 1000, metodo: 'EFECTIVO',
      solicitudId: randomUUID(),
    })).status, 409)
    assert.equal((await Caja.findById(cajaAdmin.id)).estado, 'CERRADA')
  })

  await t.test('pago y cierre simultáneos conservan el balance', async () => {
    const cita = await nuevaCita(100)
    const respuestas = await Promise.all([
      pagar(recepcionToken, datosPago(cita, 100)),
      cerrar(recepcionToken, cajaRecepcion.id, 700),
    ])
    assert.ok(respuestas.every((r) => [200, 201, 409].includes(r.status)))
    let caja = await Caja.findById(cajaRecepcion.id)
    if (caja.estado === 'ABIERTA') {
      const totales = await Pago.aggregate([{ $match: { caja: caja._id,
        estado: 'REGISTRADO', metodo: 'EFECTIVO' } },
      { $group: { _id: null, monto: { $sum: '$montoCentavos' } } }])
      assert.equal((await cerrar(recepcionToken, caja.id, totales[0]?.monto ?? 0)).status, 200)
      caja = await Caja.findById(caja.id)
    }
    const pagos = await Pago.find({ caja: caja._id, estado: 'REGISTRADO' })
    const efectivo = pagos.filter((p) => p.metodo === 'EFECTIVO')
      .reduce((suma, p) => suma + p.montoCentavos, 0)
    assert.equal(caja.totalEfectivoCentavos, efectivo)
    assert.equal(caja.totalIngresosCentavos, pagos.reduce((suma, p) => suma + p.montoCentavos, 0))
    assert.equal((await pagar(recepcionToken, datosPago(await nuevaCita(100), 1))).status, 409)
  })

  await t.test('persistencia, auditoría e inexistencia de eliminación física', async () => {
    const pagos = await Pago.find()
    assert.ok(pagos.length >= 6)
    assert.equal(new Set(pagos.map((p) => p.numeroComprobante)).size, pagos.length)
    assert.equal(new Set(pagos.map((p) => p.solicitudId)).size, pagos.length)
    for (const pago of pagos) {
      assert.ok(pago.fechaPago instanceof Date)
      assert.ok(pago.paciente && pago.cita && pago.caja && pago.registradoPor)
    }
    assert.equal((await pedir(base, `/api/pagos/${pagos[0].id}`, adminToken, 'DELETE')).status, 404)
    assert.equal((await pedir(base, '/api/pagos', adminToken, 'GET')).status, 200)
    assert.equal(await Pago.countDocuments(), pagos.length)
  })
})
