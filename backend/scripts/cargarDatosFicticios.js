import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { conectarBaseDeDatos } from '../src/config/db.js'
import { passwordNuevaValida } from '../src/services/validacionCuenta.js'
import { siguienteCodigoPaciente } from '../src/services/codigosPaciente.js'
import { siguienteCodigoResponsable } from '../src/services/codigosResponsable.js'
import { siguienteCodigoServicio } from '../src/services/codigosServicio.js'
import { siguienteCodigoMaterial } from '../src/services/codigosMaterial.js'
import { siguienteCodigoCaja } from '../src/services/codigosCaja.js'
import { crearSolicitudConCodigo } from '../src/services/codigosSolicitud.js'
import { siguienteComprobantePago } from '../src/services/comprobantesPago.js'
import Usuario from '../src/models/Usuario.js'
import Paciente from '../src/models/Paciente.js'
import Responsable from '../src/models/Responsable.js'
import Servicio from '../src/models/Servicio.js'
import Cita from '../src/models/Cita.js'
import SolicitudCita from '../src/models/SolicitudCita.js'
import Material from '../src/models/Material.js'
import AsignacionMaterial from '../src/models/AsignacionMaterial.js'
import Pago from '../src/models/Pago.js'
import Caja from '../src/models/Caja.js'
import Contador from '../src/models/Contador.js'
import ContenidoInstitucional from '../src/models/ContenidoInstitucional.js'
import Horario, { DIAS } from '../src/models/Horario.js'
import MensajeContacto from '../src/models/MensajeContacto.js'

const marca = 'datosFicticiosEntregaFinal'
const imagenDemo = '/imagenes/centro-medico-jalapa-logo.png'
const nombres = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elena', 'Fabio',
  'Gabriela', 'Hugo', 'Iris', 'Javier']
const nombresServicio = ['Orientación familiar', 'Estimulación del lenguaje',
  'Apoyo educativo', 'Consulta psicológica', 'Seguimiento integral']

function fechaGuatemala(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha)
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.year}-${datos.month}-${datos.day}`
}

function diasHabiles(cantidad, { futuros = true } = {}) {
  const hoy = fechaGuatemala(new Date())
  const base = new Date(`${hoy}T12:00:00.000Z`)
  const fechas = []
  for (let dia = 1; fechas.length < cantidad; dia += 1) {
    const desplazamiento = futuros ? dia + 6 : -dia
    const fecha = new Date(base.getTime() + desplazamiento * 86400000)
    if (fecha.getUTCDay() >= 1 && fecha.getUTCDay() <= 5) {
      fechas.push(fecha.toISOString().slice(0, 10))
    }
  }
  return futuros ? fechas : fechas.reverse()
}

async function crearUno(Modelo, datos, session) {
  const [documento] = await Modelo.create([datos], { session })
  return documento
}

export async function cargarDatosFicticios(nombreEsperado, { aplicar = false,
  password = process.env.SIGCA_DEMO_PASSWORD } = {}) {
  if (!['sigca_dev', 'sigca_test'].includes(nombreEsperado) ||
      mongoose.connection.name !== nombreEsperado) {
    throw new Error('La carga solo admite una conexión confirmada a sigca_dev o sigca_test')
  }
  if (await Contador.exists({ _id: marca })) {
    return { estado: 'ya cargado', base: nombreEsperado }
  }
  if (!aplicar) return { estado: 'simulación', base: nombreEsperado,
    previstos: { usuarios: 6, responsables: 5, pacientes: 10, servicios: 5,
      citas: 15, materiales: 5, asignaciones: 5, solicitudes: 5,
      pagos: 10, cajas: 3 } }
  if (!passwordNuevaValida(password)) {
    throw new Error('Configura SIGCA_DEMO_PASSWORD de forma privada con la política de contraseñas')
  }
  const modelosConCodigo = [Paciente, Responsable, Servicio, Material, Caja]
  if ((await Promise.all(modelosConCodigo.map((Modelo) =>
    Modelo.exists({ codigo: null })))).some(Boolean)) {
    throw new Error('Asigna primero los códigos a registros anteriores en esta base')
  }
  await Promise.all([Usuario, Paciente, Responsable, Servicio, Cita, SolicitudCita,
    Material, AsignacionMaterial, Pago, Caja, Contador, ContenidoInstitucional,
    Horario, MensajeContacto].map((Modelo) => Modelo.init()))

  const passwordHash = await bcrypt.hash(password, 12)
  const session = await mongoose.startSession()
  try {
    return await session.withTransaction(async () => {
      await crearUno(Contador, { _id: marca, secuencia: 1 }, session)
      const usuarios = []
      const roles = ['ADMINISTRADOR', 'RECEPCIONISTA', 'RECEPCIONISTA',
        'PROFESIONAL', 'PROFESIONAL', 'PROFESIONAL']
      const nombresUsuario = ['Administradora Demo', 'Recepcionista Alba',
        'Recepcionista Berta', 'Profesional Clara', 'Profesional Daniel',
        'Profesional Elena']
      for (let i = 0; i < roles.length; i += 1) {
        usuarios.push(await crearUno(Usuario, { nombre: nombresUsuario[i],
          correo: `sigca.demo.${i + 1}@example.test`, passwordHash,
          rol: roles[i], correoVerificado: true }, session))
      }

      const responsables = []
      for (let i = 0; i < 5; i += 1) {
        responsables.push(await crearUno(Responsable, {
          codigo: await siguienteCodigoResponsable({ session }),
          fotografia: imagenDemo, nombres: nombres[i], apellidos: 'Demostracion',
          parentesco: 'Madre', telefono: `55551${String(i).padStart(3, '0')}`,
          correo: `sigca.responsable.${i + 1}@example.test`,
          direccion: 'Dirección ficticia para pruebas',
        }, session))
      }
      const pacientes = []
      for (let i = 0; i < 10; i += 1) {
        pacientes.push(await crearUno(Paciente, {
          codigo: await siguienteCodigoPaciente({ session }), fotografia: imagenDemo,
          nombres: nombres[i], apellidos: 'Demostracion',
          fechaNacimiento: i < 5 ? '2017-05-10' : '1998-05-10',
          sexo: i % 2 ? 'MASCULINO' : 'FEMENINO',
          telefono: `55552${String(i).padStart(3, '0')}`,
          direccion: 'Dirección ficticia para pruebas',
          fechaInicioProceso: fechaGuatemala(new Date()),
          responsables: i < 5 ? [responsables[i]._id] : [],
        }, session))
      }
      const servicios = []
      for (let i = 0; i < 5; i += 1) {
        servicios.push(await crearUno(Servicio, {
          codigo: await siguienteCodigoServicio({ session }),
          nombre: `${nombresServicio[i]} de demostración`,
          descripcion: 'Servicio ficticio para demostrar el sistema.',
          duracionMinutos: 45, precioCentavos: 10000 + i * 1000,
          imagen: imagenDemo,
        }, session))
      }
      const materiales = []
      for (let i = 0; i < 5; i += 1) {
        materiales.push(await crearUno(Material, {
          codigo: await siguienteCodigoMaterial({ session }),
          titulo: `Material educativo de demostración ${i + 1}`,
          descripcion: 'Recurso ficticio para comprobar el catálogo y las asignaciones.',
          tipo: i % 2 ? 'Guía' : 'Artículo',
          enlace: `https://example.test/material-${i + 1}`,
        }, session))
      }

      const fechas = [...diasHabiles(3, { futuros: false }), ...diasHabiles(2)]
      const citas = []
      for (let i = 0; i < 15; i += 1) {
        const servicio = servicios[i % servicios.length]
        citas.push(await crearUno(Cita, {
          paciente: pacientes[i % pacientes.length]._id, servicio: servicio._id,
          profesional: usuarios[3 + (i % 3)]._id,
          fecha: fechas[Math.floor(i / 3)], horaInicio: '09:00', horaFin: '09:45',
          minutosOcupados: Array.from({ length: 45 }, (_, minuto) => 540 + minuto),
          duracionMinutos: 45, precioCentavos: servicio.precioCentavos,
          estado: i < 9 ? 'COMPLETADA' : 'CONFIRMADA',
        }, session))
      }
      for (let i = 0; i < 5; i += 1) {
        await crearUno(AsignacionMaterial, { material: materiales[i]._id,
          paciente: pacientes[i]._id, asignadoPor: citas[i].profesional }, session)
        await crearSolicitudConCodigo({
          nombreSolicitante: `${nombres[i]} Demostracion`,
          correo: `sigca.solicitud.${i + 1}@example.test`, telefono: `55553${String(i).padStart(3, '0')}`,
          servicio: servicios[i]._id, fechaPreferida: fechas[3 + (i % 2)],
          mensajeAdicional: 'Solicitud ficticia de demostración.',
        }, undefined, session)
      }

      const cajas = []
      const responsablesCaja = [usuarios[1], usuarios[2], usuarios[0]]
      const montosIniciales = [10000, 5000, 0]
      for (let i = 0; i < 3; i += 1) {
        cajas.push(await crearUno(Caja, {
          codigo: await siguienteCodigoCaja({ session }),
          usuarioResponsable: responsablesCaja[i]._id,
          fechaOperativa: fechaGuatemala(new Date()),
          montoInicialCentavos: montosIniciales[i],
        }, session))
      }
      const movimientos = [
        [0, 0, 3000, 'EFECTIVO'], [0, 0, 7000, 'TRANSFERENCIA'],
        [0, 1, 2000, 'TARJETA'], [0, 2, 2500, 'EFECTIVO', 'ANULADO'],
        [1, 3, 4000, 'EFECTIVO'], [1, 4, 3000, 'TRANSFERENCIA'],
        [1, 5, 3000, 'TARJETA'], [2, 6, 5000, 'EFECTIVO'],
        [2, 7, 1000, 'TRANSFERENCIA'], [2, 8, 1500, 'TARJETA'],
      ]
      const totales = Array.from({ length: 3 }, () =>
        ({ EFECTIVO: 0, TRANSFERENCIA: 0, TARJETA: 0 }))
      for (const [indiceCaja, indiceCita, montoCentavos, metodo, estado] of movimientos) {
        const caja = cajas[indiceCaja]
        const cita = citas[indiceCita]
        const valido = estado !== 'ANULADO'
        await crearUno(Pago, {
          numeroComprobante: await siguienteComprobantePago(session),
          paciente: cita.paciente, cita: cita._id, caja: caja._id,
          montoCentavos, metodo, registradoPor: responsablesCaja[indiceCaja]._id,
          solicitudId: randomUUID(), estado: valido ? 'REGISTRADO' : 'ANULADO',
          ...(valido ? {} : { motivoAnulacion: 'Anulación ficticia de demostración',
            fechaAnulacion: new Date(), anuladoPor: usuarios[0]._id }),
        }, session)
        if (valido) totales[indiceCaja][metodo] += montoCentavos
      }
      for (let i = 0; i < 2; i += 1) {
        const totalIngresosCentavos = Object.values(totales[i])
          .reduce((suma, monto) => suma + monto, 0)
        const efectivoEsperadoCentavos = montosIniciales[i] + totales[i].EFECTIVO
        await Caja.updateOne({ _id: cajas[i]._id }, { $set: {
          estado: 'CERRADA', cerradaEn: new Date(), cerradaPor: responsablesCaja[i]._id,
          totalEfectivoCentavos: totales[i].EFECTIVO,
          totalTransferenciaCentavos: totales[i].TRANSFERENCIA,
          totalTarjetaCentavos: totales[i].TARJETA, totalIngresosCentavos,
          efectivoEsperadoCentavos, efectivoContadoCentavos: efectivoEsperadoCentavos - 100,
          diferenciaCentavos: -100,
        } }, { session, runValidators: true })
      }

      const contenido = await ContenidoInstitucional.findOne({ clave: 'principal' }).session(session)
      if (!contenido) await crearUno(ContenidoInstitucional, {
        clave: 'principal', nombreCentro: 'Centro de demostración SIGCA',
        informacionPrincipal: 'Contenido ficticio para probar el portal público.',
        mision: 'Demostrar el funcionamiento académico de SIGCA.',
        vision: 'Presentar un ejemplo de atención organizada.',
        contacto: { correo: 'sigca.centro@example.test', telefono: '55550000',
          direccion: 'Dirección ficticia de demostración' },
      }, session)
      for (const [indice, dia] of DIAS.entries()) {
        if (!await Horario.exists({ dia }).session(session)) {
          await crearUno(Horario, { dia, activo: indice < 5,
            intervalos: indice < 5 ? [{ horaInicio: '08:00', horaFin: '17:00' }] : [],
          }, session)
        }
      }
      await crearUno(MensajeContacto, { nombre: 'Contacto Demo',
        correo: 'sigca.contacto@example.test', telefono: '55550000',
        asunto: 'Mensaje ficticio', mensaje: 'Consulta de demostración.' }, session)
      return { estado: 'cargado', base: nombreEsperado,
        creados: { usuarios: usuarios.length, responsables: responsables.length,
          pacientes: pacientes.length, servicios: servicios.length,
          citas: citas.length, materiales: materiales.length, asignaciones: 5,
          solicitudes: 5, pagos: movimientos.length, cajas: cajas.length } }
    })
  } finally {
    await session.endSession()
  }
}

async function ejecutar() {
  const [baseArgumento, accion] = process.argv.slice(2)
  const nombreEsperado = /^--db=(sigca_dev|sigca_test)$/.exec(baseArgumento)?.[1]
  if (!nombreEsperado || (accion !== undefined && accion !== '--aplicar') ||
      process.argv.slice(2).length > 2) {
    throw new Error('Indica --db=sigca_dev o --db=sigca_test; para escribir agrega --aplicar')
  }
  if (accion !== '--aplicar') mongoose.set('autoIndex', false)
  await conectarBaseDeDatos()
  try {
    const resultado = await cargarDatosFicticios(nombreEsperado, { aplicar: accion === '--aplicar' })
    console.log(JSON.stringify(resultado))
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ejecutar().catch((error) => {
    console.error(`No se completó la carga (${error.name}). Revisa la base y la configuración privada.`)
    process.exitCode = 1
    mongoose.disconnect().catch(() => {})
  })
}
