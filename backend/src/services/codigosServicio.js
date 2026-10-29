import Contador from '../models/Contador.js'

export function codigoServicio(numero) {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('Secuencia de servicios inválida')
  }
  return `SERV-INT-${String(numero).padStart(4, '0')}`
}

export async function siguienteCodigoServicio({ session } = {}) {
  const contador = await Contador.findOneAndUpdate(
    { _id: 'serviciosInternos' }, { $inc: { secuencia: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  )
  return codigoServicio(contador.secuencia)
}
