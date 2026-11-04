import Contador from '../models/Contador.js'

export function codigoCaja(numero) {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('Secuencia de cajas inválida')
  }
  return `CAJ-${String(numero).padStart(4, '0')}`
}

export async function siguienteCodigoCaja({ session } = {}) {
  const contador = await Contador.findOneAndUpdate(
    { _id: 'cajas' }, { $inc: { secuencia: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  )
  return codigoCaja(contador.secuencia)
}
