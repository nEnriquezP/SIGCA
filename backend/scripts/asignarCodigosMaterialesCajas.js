import 'dotenv/config'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import mongoose from 'mongoose'
import { conectarBaseDeDatos } from '../src/config/db.js'
import Contador from '../src/models/Contador.js'
import Material from '../src/models/Material.js'
import Caja from '../src/models/Caja.js'
import { codigoMaterial, siguienteCodigoMaterial } from '../src/services/codigosMaterial.js'
import { codigoCaja, siguienteCodigoCaja } from '../src/services/codigosCaja.js'

const entidades = [
  { nombre: 'materiales', modelo: Material, patron: /^MAT-(\d{4,})$/,
    codigo: codigoMaterial, siguiente: siguienteCodigoMaterial,
    orden: { fechaRegistro: 1, _id: 1 } },
  { nombre: 'cajas', modelo: Caja, patron: /^CAJ-(\d{4,})$/,
    codigo: codigoCaja, siguiente: siguienteCodigoCaja,
    orden: { abiertaEn: 1, _id: 1 } },
]

async function inspeccionar(entidad) {
  const codificados = await entidad.modelo.find({ codigo: { $type: 'string' } })
    .select('codigo').lean()
  const vistos = new Set()
  let mayor = 0
  for (const documento of codificados) {
    const numero = Number(entidad.patron.exec(documento.codigo)?.[1])
    if (!Number.isSafeInteger(numero) || numero < 1 ||
        entidad.codigo(numero) !== documento.codigo || vistos.has(documento.codigo)) {
      throw new Error(`Hay códigos de ${entidad.nombre} inválidos o repetidos; no se escribió información`)
    }
    vistos.add(documento.codigo)
    mayor = Math.max(mayor, numero)
  }
  const pendientes = await entidad.modelo.find({ codigo: null }).select('_id')
    .sort(entidad.orden).lean()
  const contador = await Contador.findById(entidad.nombre)
  if (mayor === 0 && pendientes.length && contador?.secuencia > 0) {
    throw new Error(`La secuencia de ${entidad.nombre} requiere revisión antes de escribir`)
  }
  return { entidad, pendientes, mayor, secuencia: contador?.secuencia ?? 0 }
}

export async function asignarCodigosExistentes(nombreEsperado, { aplicar = false } = {}) {
  if (mongoose.connection.name !== nombreEsperado) {
    throw new Error('La base conectada no coincide con --db; no se escribió información')
  }
  // Se inspeccionan ambas colecciones antes de la primera escritura.
  const planes = await Promise.all(entidades.map(inspeccionar))
  if (!aplicar) return planes.map(({ entidad, pendientes, mayor, secuencia }) =>
    ({ entidad: entidad.nombre, pendientesIniciales: pendientes.length,
      asignados: 0, faltantes: pendientes.length, ultimoNumero: Math.max(mayor, secuencia) }))

  const resultados = []
  for (const { entidad, pendientes, mayor, secuencia } of planes) {
    await entidad.modelo.init()
    if (secuencia < mayor) {
      await Contador.findOneAndUpdate({ _id: entidad.nombre },
        { $max: { secuencia: mayor } }, { upsert: true, returnDocument: 'after' })
    }
    let asignados = 0
    const session = await mongoose.startSession()
    try {
      for (const documento of pendientes) {
        let asignado = false
        await session.withTransaction(async () => {
          asignado = false
          const sinCodigo = await entidad.modelo.collection.findOne(
            { _id: documento._id, codigo: null }, { projection: { _id: 1 }, session })
          if (!sinCodigo) return
          const codigo = await entidad.siguiente({ session })
          const resultado = await entidad.modelo.collection.updateOne(
            { _id: documento._id, codigo: null }, { $set: { codigo } }, { session })
          if (resultado.modifiedCount !== 1) throw new Error('No se pudo asignar un código')
          asignado = true
        })
        if (asignado) asignados += 1
      }
    } finally {
      await session.endSession()
    }
    const faltantes = await entidad.modelo.countDocuments({ codigo: null })
    const contador = await Contador.findById(entidad.nombre)
    resultados.push({ entidad: entidad.nombre, pendientesIniciales: pendientes.length,
      asignados, faltantes, ultimoNumero: contador?.secuencia ?? 0 })
  }
  return resultados
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
  await conectarBaseDeDatos()
  try {
    const resultados = await asignarCodigosExistentes(nombreEsperado, { aplicar })
    for (const resultado of resultados) {
      console.log(`${aplicar ? 'Aplicado' : 'Simulación'}: ${resultado.entidad}; ` +
        `pendientes: ${resultado.pendientesIniciales}; asignados: ${resultado.asignados}; ` +
        `faltantes: ${resultado.faltantes}; último número: ${resultado.ultimoNumero}`)
      if (aplicar && resultado.faltantes) process.exitCode = 1
    }
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
