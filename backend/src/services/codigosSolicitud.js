import mongoose from 'mongoose'
import SolicitudCita from '../models/SolicitudCita.js'

export function codigoSolicitud(id, longitud = 5) {
  const hex = String(id).toLowerCase()
  if (!/^[0-9a-f]{24}$/.test(hex) || !Number.isInteger(longitud) ||
      longitud < 5 || longitud > 24) throw new Error('Identificador de solicitud inválido')
  return `CONS-CITA-${hex.slice(-longitud).toUpperCase()}`
}

export async function crearSolicitudConCodigo(datos, _id = new mongoose.Types.ObjectId(), session = null) {
  await SolicitudCita.init()
  for (let longitud = 5; longitud <= 24; longitud += 1) {
    const codigo = codigoSolicitud(_id, longitud)
    const existe = session ? await SolicitudCita.findOne({ codigo }, '_id', { session }) :
      await SolicitudCita.exists({ codigo })
    if (existe) continue
    try {
      if (session) {
        const [solicitud] = await SolicitudCita.create([{ ...datos, _id, codigo }], { session })
        return solicitud
      }
      return await SolicitudCita.create({ ...datos, _id, codigo })
    } catch (error) {
      if (session || error.code !== 11000 || !error.keyPattern?.codigo) throw error
    }
  }
  throw new Error('No se pudo generar un código único para la solicitud')
}
