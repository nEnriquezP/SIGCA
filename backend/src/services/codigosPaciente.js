import Contador from '../models/Contador.js'

export function codigoPaciente(numero) {
  if (!Number.isSafeInteger(numero) || numero < 1) {
    throw new Error('Secuencia de pacientes inválida')
  }
  return `PAC-${String(numero).padStart(6, '0')}`
}

export async function siguienteCodigoPaciente({ session } = {}) {
  const contador = await Contador.findOneAndUpdate(
    { _id: 'pacientes' }, { $inc: { secuencia: 1 } },
    { upsert: true, returnDocument: 'after', ...(session ? { session } : {}) },
  )
  return codigoPaciente(contador.secuencia)
}
