import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { conectarBaseDeDatos } from '../src/config/db.js'
import Contador from '../src/models/Contador.js'
import Responsable from '../src/models/Responsable.js'
import { codigoResponsable, siguienteCodigoResponsable } from '../src/services/codigosResponsable.js'

export async function asignarCodigosExistentes(nombreEsperado) {
  if (mongoose.connection.name !== nombreEsperado) {
    throw new Error('La base conectada no coincide con --db; no se escribió información')
  }

  await Responsable.init()
  const codificados = await Responsable.find({ codigo: { $type: 'string' } })
    .select('codigo').lean()
  let mayor = 0
  for (const responsable of codificados) {
    const numero = Number(/^RESPO-(\d{6,})$/.exec(responsable.codigo)?.[1])
    if (!Number.isSafeInteger(numero) || numero < 1 || codigoResponsable(numero) !== responsable.codigo) {
      throw new Error('Hay un código de responsable inválido; no se escribió información')
    }
    mayor = Math.max(mayor, numero)
  }

  const pendientes = await Responsable.find({ codigo: null }).select('_id')
    .sort({ createdAt: 1, _id: 1 }).lean()
  const contadorActual = await Contador.findById('responsables')
  if (mayor === 0 && pendientes.length && contadorActual?.secuencia > 0) {
    throw new Error('Existe una secuencia sin códigos asignados; requiere revisión antes de escribir')
  }
  if (!contadorActual || contadorActual.secuencia < mayor) {
    await Contador.findOneAndUpdate({ _id: 'responsables' },
      { $max: { secuencia: mayor } }, { upsert: true, returnDocument: 'after' })
  }

  let asignados = 0
  const session = await mongoose.startSession()
  try {
    for (const responsable of pendientes) {
      let asignado = false
      await session.withTransaction(async () => {
        asignado = false
        const sinCodigo = await Responsable.collection.findOne(
          { _id: responsable._id, codigo: null }, { projection: { _id: 1 }, session })
        if (!sinCodigo) return
        const codigo = await siguienteCodigoResponsable({ session })
        const resultado = await Responsable.collection.updateOne(
          { _id: responsable._id, codigo: null }, { $set: { codigo } }, { session })
        if (resultado.modifiedCount !== 1) throw new Error('No se pudo asignar un código')
        asignado = true
      })
      if (asignado) asignados += 1
    }
  } finally {
    await session.endSession()
  }

  const faltantes = await Responsable.countDocuments({ codigo: null })
  const contador = await Contador.findById('responsables')
  return { base: nombreEsperado, pendientesIniciales: pendientes.length,
    asignados, faltantes, ultimoNumero: contador?.secuencia ?? 0 }
}

async function ejecutar() {
  const [baseArgumento, confirmacion] = process.argv.slice(2)
  const nombreEsperado = /^--db=(sigca_dev|sigca_test|sigca_prod)$/.exec(baseArgumento)?.[1]
  if (!nombreEsperado || (nombreEsperado === 'sigca_prod' &&
      confirmacion !== '--confirmar-produccion') ||
      (nombreEsperado !== 'sigca_prod' && confirmacion !== undefined)) {
    throw new Error('Indica --db=sigca_dev o --db=sigca_test; producción requiere --confirmar-produccion')
  }
  await conectarBaseDeDatos()
  try {
    const resumen = await asignarCodigosExistentes(nombreEsperado)
    console.log(`Base: ${resumen.base}; pendientes iniciales: ${resumen.pendientesIniciales}; ` +
      `asignados: ${resumen.asignados}; faltantes: ${resumen.faltantes}; ` +
      `último número: ${resumen.ultimoNumero}`)
    if (resumen.faltantes) process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ejecutar().catch((error) => {
    console.error(`No se completó la asignación (${error.name}). ${error.message.startsWith('La base conectada') ? error.message : 'Revisa el entorno sin compartir credenciales.'}`)
    process.exitCode = 1
    mongoose.disconnect().catch(() => {})
  })
}
