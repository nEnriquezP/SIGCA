import Contador from '../models/Contador.js'

export function codigoResponsable(numero) {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('Secuencia de responsables inválida')
  }
  return `RESPO-${String(numero).padStart(6, '0')}`
}

export async function siguienteCodigoResponsable({ session } = {}) {
  const contador = await Contador.findOneAndUpdate(
    { _id: 'responsables' }, { $inc: { secuencia: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  )
  return codigoResponsable(contador.secuencia)
}
