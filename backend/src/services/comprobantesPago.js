import Contador from '../models/Contador.js'

export async function siguienteComprobantePago(session) {
  const contador = await Contador.findOneAndUpdate({ _id: 'pagos' },
    { $inc: { secuencia: 1 } },
    { upsert: true, returnDocument: 'after', session })
  if (!Number.isSafeInteger(contador.secuencia) || contador.secuencia < 1) {
    throw new Error('Secuencia de comprobantes inválida')
  }
  return `PAG-${String(contador.secuencia).padStart(6, '0')}`
}
