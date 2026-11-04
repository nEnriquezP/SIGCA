import Contador from '../models/Contador.js'

export function codigoMaterial(numero) {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('Secuencia de materiales inválida')
  }
  return `MAT-${String(numero).padStart(4, '0')}`
}

export async function siguienteCodigoMaterial({ session } = {}) {
  const contador = await Contador.findOneAndUpdate(
    { _id: 'materiales' }, { $inc: { secuencia: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  )
  return codigoMaterial(contador.secuencia)
}
