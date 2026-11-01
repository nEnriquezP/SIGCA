import { createHash, randomBytes } from 'node:crypto'
import TokenCorreo from '../models/TokenCorreo.js'
import AvisoCorreo from '../models/AvisoCorreo.js'
import Paciente from '../models/Paciente.js'
import Responsable from '../models/Responsable.js'
import Usuario from '../models/Usuario.js'
import Cita from '../models/Cita.js'
import Publicacion from '../models/Publicacion.js'

const modelos = { PACIENTE: Paciente, RESPONSABLE: Responsable, USUARIO: Usuario }
const horasToken = { VERIFICAR: 6, RECUPERAR: 1 }
const origen = () => process.env.APP_PUBLIC_URL?.replace(/\/+$/, '')

export function correoConfigurado() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && origen())
}

export async function enviarCorreo({ destinatario, asunto, texto, clave }) {
  if (!correoConfigurado()) throw new Error('Servicio de correo no configurado')
  const respuesta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json', ...(clave ? { 'Idempotency-Key': clave } : {}) },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [destinatario], subject: asunto,
      text: texto }),
    signal: AbortSignal.timeout(15000),
  })
  if (!respuesta.ok) throw new Error(`Proveedor de correo respondió ${respuesta.status}`)
}

export async function emitirEnlace(tipo, entidad, proposito) {
  if (!correoConfigurado()) return false
  if (!modelos[tipo] || !horasToken[proposito] || !entidad.correo) return false
  const ahora = new Date()
  const secreto = randomBytes(32).toString('base64url')
  const hash = createHash('sha256').update(secreto).digest('hex')
  let token
  const esVerificacion = proposito === 'VERIFICAR'
  const ruta = esVerificacion ? 'verificar-correo' : 'restablecer-password'
  const asunto = esVerificacion ? 'Verifica tu correo para SIGCA' : 'Restablece tu contraseña de SIGCA'
  const texto = `${asunto}. Abre este enlace dentro de ${horasToken[proposito]} hora(s):\n` +
    `${origen()}/${ruta}#token=${secreto}\nSi no solicitaste esto, ignora el mensaje.`
  try {
    token = await TokenCorreo.create({ hash, tipo, entidad: entidad._id,
      correo: entidad.correo.toLowerCase(), proposito,
      vence: new Date(ahora.getTime() + horasToken[proposito] * 3600000) })
    await enviarCorreo({ destinatario: entidad.correo, asunto, texto })
  } catch (error) {
    if (token) await TokenCorreo.deleteOne({ _id: token._id }).catch((fallo) => {
      console.error('No se pudo limpiar un enlace no enviado:', fallo.message)
    })
    console.error('No se pudo enviar un enlace por correo:', error.message)
    return false
  }
  // La limpieza de enlaces anteriores no debe invalidar el enlace ya recibido.
  try {
    await TokenCorreo.updateMany({ tipo, entidad: entidad._id, proposito,
      _id: { $ne: token._id }, usado: false }, { $set: { usado: true } })
  } catch (error) {
    console.error('No se pudieron invalidar enlaces anteriores:', error.message)
  }
  return true
}

export async function consumirEnlace(secreto, proposito) {
  if (typeof secreto !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secreto)) return null
  const hash = createHash('sha256').update(secreto).digest('hex')
  const token = await TokenCorreo.findOneAndUpdate({ hash, proposito, usado: false,
    vence: { $gt: new Date() } }, { $set: { usado: true } }, { returnDocument: 'after' })
  if (!token) return null
  const entidad = await modelos[token.tipo].findById(token.entidad)
  if (!entidad || entidad.correo?.toLowerCase() !== token.correo) return null
  return { token, entidad }
}

async function encolar(clave, destinatario, asunto, texto, programado = new Date()) {
  if (!correoConfigurado() || !destinatario) return
  await AvisoCorreo.updateOne({ clave }, { $setOnInsert: { clave, destinatario,
    asunto, texto, programado } }, { upsert: true }).catch((error) => {
    if (error.code !== 11000) throw error
  })
}

function fechaHora(cita) {
  const [anio, mes, dia] = cita.fecha.split('-')
  return `${dia}/${mes}/${anio} a las ${cita.horaInicio} (Guatemala)`
}

function inicioUTC(cita) { return new Date(`${cita.fecha}T${cita.horaInicio}:00-06:00`) }

export async function avisarCita(citaId, evento) {
  if (!correoConfigurado()) return
  try {
    const cita = await Cita.findById(citaId).populate('paciente').populate('profesional')
    if (!cita?.paciente) return
    const responsables = await Responsable.find({ _id: { $in: cita.paciente.responsables ?? [] } })
    const destinatarios = [cita.paciente, ...responsables, cita.profesional]
      .filter((persona) => persona?.correo && persona.correoVerificado === true)
    const unicos = [...new Set(destinatarios.map((persona) => persona.correo.toLowerCase()))]
    const asuntos = { PENDIENTE: 'Cita registrada, pendiente de confirmación',
      CONFIRMADA: 'Cita confirmada', REPROGRAMADA: 'Cita reprogramada',
      CANCELADA: 'Cita cancelada' }
    const fecha = fechaHora(cita)
    for (const correo of unicos) {
      await encolar(`cita:${cita.id}:${evento}:${cita.updatedAt?.getTime() ?? 0}:${correo}`,
        correo, asuntos[evento], `${asuntos[evento]} para ${fecha}. Centro Médico Jalapa.`)
      if (evento === 'CONFIRMADA' || (evento === 'REPROGRAMADA' && cita.estado === 'CONFIRMADA')) {
        for (const horas of [24, 6]) {
          const momento = new Date(inicioUTC(cita).getTime() - horas * 3600000)
          if (momento > new Date()) await encolar(
            `recordatorio:${cita.id}:${cita.updatedAt?.getTime() ?? 0}:${horas}:${correo}`,
            correo, `Recordatorio de cita: faltan ${horas} horas`,
            `Tu cita está programada para ${fecha}. Centro Médico Jalapa.`, momento)
        }
      }
    }
  } catch (error) {
    console.error('No se pudieron preparar avisos de cita:', error.message)
  }
}

export async function avisarPublicacion(item) {
  if (!correoConfigurado() || !item.activo) return
  try {
    const listas = await Promise.all([Paciente, Responsable, Usuario].map((modelo) =>
      modelo.find({ correoVerificado: true, recibirPublicaciones: true }).select('correo')))
    const destinatarios = [...new Set(listas.flat().map((persona) => persona.correo.toLowerCase()))]
    for (const correo of destinatarios) await encolar(`publicacion:${item.id}:${correo}`, correo,
      'Nueva publicación de Centro Médico Jalapa',
      `${item.titulo}. Consulta el portal: ${origen()}/`)
  } catch (error) {
    console.error('No se pudieron preparar avisos de publicación:', error.message)
  }
}

async function destinatarioVigente(correo, cita) {
  const paciente = await Paciente.findById(cita.paciente)
  if (!paciente) return false
  const responsables = await Responsable.find({ _id: { $in: paciente.responsables ?? [] } })
  const profesional = await Usuario.findById(cita.profesional)
  return [paciente, ...responsables, profesional].some((persona) =>
    persona?.correoVerificado === true && persona.correo?.toLowerCase() === correo)
}

async function avisoVigente(aviso) {
  if (aviso.clave.startsWith('publicacion:')) {
    const [, id] = aviso.clave.split(':')
    if (!await Publicacion.exists({ _id: id, activo: true })) return false
    for (const modelo of [Paciente, Responsable, Usuario]) {
      if (await modelo.exists({ correo: aviso.destinatario,
        correoVerificado: true, recibirPublicaciones: true })) return true
    }
    return false
  }
  if (aviso.clave.startsWith('cita:') || aviso.clave.startsWith('recordatorio:')) {
    const [tipo, id, versionSiRecordatorio] = aviso.clave.split(':')
    const cita = await Cita.findById(id)
    if (!cita) return false
    if (tipo === 'recordatorio') {
      if (String(cita.updatedAt?.getTime()) !== versionSiRecordatorio ||
          cita.estado !== 'CONFIRMADA' || inicioUTC(cita) <= new Date()) return false
    }
    // Los avisos inmediatos registran cambios históricos: si se confirma pronto,
    // el aviso de creación pendiente debe enviarse antes del de confirmación.
    return destinatarioVigente(aviso.destinatario, cita)
  }
  return false
}

export async function procesarAvisos() {
  if (!correoConfigurado()) return { procesados: 0, pendienteConfiguracion: true }
  let procesados = 0
  for (let n = 0; n < 50; n += 1) {
    const ahora = new Date()
    const aviso = await AvisoCorreo.findOneAndUpdate({ programado: { $lte: ahora },
      $or: [{ estado: 'PENDIENTE' }, { estado: 'ENVIANDO', bloqueoHasta: { $lte: ahora } }] },
    { $set: { estado: 'ENVIANDO', bloqueoHasta: new Date(ahora.getTime() + 60000) },
      $inc: { intentos: 1 } }, { sort: { programado: 1 }, returnDocument: 'after' })
    if (!aviso) break
    try {
      if (!await avisoVigente(aviso)) {
        await AvisoCorreo.updateOne({ _id: aviso._id }, { $set: { estado: 'ENVIADO' } })
        continue
      }
      await enviarCorreo(aviso)
      await AvisoCorreo.updateOne({ _id: aviso._id },
        { $set: { estado: 'ENVIADO', enviadoEn: new Date() } })
      procesados += 1
    } catch (error) {
      console.error('No se pudo enviar aviso:', error.message)
      await AvisoCorreo.updateOne({ _id: aviso._id }, { $set: { estado: 'PENDIENTE',
        programado: new Date(Date.now() + Math.min(3600000, aviso.intentos * 60000)) } })
    }
  }
  return { procesados }
}
