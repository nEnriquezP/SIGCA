import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { conectarBaseDeDatos } from '../src/config/db.js'
import SolicitudCita from '../src/models/SolicitudCita.js'
import { codigoSolicitud } from '../src/services/codigosSolicitud.js'

export async function asignarCodigosSolicitudes(nombreEsperado, { aplicar = false } = {}) {
  if (mongoose.connection.name !== nombreEsperado) {
    throw new Error('La base conectada no coincide con --db; no se escribió información')
  }
  const codificadas = await SolicitudCita.find({ codigo: { $type: 'string' } })
    .select('_id codigo').lean()
  const vistos = new Set()
  for (const item of codificadas) {
    const sufijo = /^CONS-CITA-([0-9A-F]{5,24})$/.exec(item.codigo)?.[1]
    if (!sufijo || codigoSolicitud(item._id, sufijo.length) !== item.codigo ||
        vistos.has(item.codigo)) {
      throw new Error('Hay códigos de solicitudes inválidos o repetidos; no se escribió información')
    }
    vistos.add(item.codigo)
  }
  const pendientes = await SolicitudCita.find({ codigo: null }).select('_id')
    .sort({ createdAt: 1, _id: 1 }).lean()
  if (!aplicar) return { pendientes: pendientes.length, asignados: 0, faltantes: pendientes.length }

  await SolicitudCita.init()
  let asignados = 0
  for (const item of pendientes) {
    for (let longitud = 5; longitud <= 24; longitud += 1) {
      const codigo = codigoSolicitud(item._id, longitud)
      if (vistos.has(codigo) || await SolicitudCita.exists({ codigo })) continue
      try {
        const resultado = await SolicitudCita.collection.updateOne(
          { _id: item._id, codigo: null }, { $set: { codigo } })
        if (resultado.modifiedCount === 1) {
          vistos.add(codigo)
          asignados += 1
        }
        break
      } catch (error) {
        if (error.code !== 11000) throw error
      }
    }
  }
  const faltantes = await SolicitudCita.countDocuments({ codigo: null })
  return { pendientes: pendientes.length, asignados, faltantes }
}

async function ejecutar() {
  const argumentos = process.argv.slice(2)
  const base = argumentos.find((argumento) => argumento.startsWith('--db='))
  const nombreEsperado = /^--db=(sigca_dev|sigca_test|sigca_prod)$/.exec(base)?.[1]
  const aplicar = argumentos.includes('--aplicar')
  const confirmarProduccion = argumentos.includes('--confirmar-produccion')
  if (!nombreEsperado || argumentos.length !== new Set(argumentos).size ||
      argumentos.some((argumento) => ![base, '--aplicar', '--confirmar-produccion'].includes(argumento)) ||
      (confirmarProduccion && (!aplicar || nombreEsperado !== 'sigca_prod')) ||
      (aplicar && nombreEsperado === 'sigca_prod' && !confirmarProduccion)) {
    throw new Error('Indica --db=sigca_dev|sigca_test|sigca_prod; para escribir agrega --aplicar y confirma producción')
  }
  if (!aplicar) mongoose.set('autoIndex', false)
  await conectarBaseDeDatos()
  try {
    const resultado = await asignarCodigosSolicitudes(nombreEsperado, { aplicar })
    console.log(`${aplicar ? 'Aplicado' : 'Simulación'} solicitudes: pendientes ${resultado.pendientes}; ` +
      `asignados ${resultado.asignados}; faltantes ${resultado.faltantes}`)
    if (aplicar && resultado.faltantes) process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ejecutar().catch((error) => {
    console.error(`No se completó la asignación (${error.name}). ` +
      (error.message.startsWith('La base conectada') ? error.message :
        'Revisa el entorno sin compartir credenciales.'))
    process.exitCode = 1
    mongoose.disconnect().catch(() => {})
  })
}
