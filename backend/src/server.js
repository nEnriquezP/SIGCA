import 'dotenv/config'
import mongoose from 'mongoose'
import app from './app.js'
import { conectarBaseDeDatos } from './config/db.js'
import Paciente from './models/Paciente.js'
import { asignarCodigosExistentes } from '../scripts/asignarCodigosMaterialesCajas.js'

const port = Number(process.env.PORT) || 3000

try {
  await conectarBaseDeDatos()
  if (process.env.RENDER === 'true' && mongoose.connection.name === 'sigca_prod') {
    const resultados = await asignarCodigosExistentes('sigca_prod', { aplicar: true })
    if (resultados.some((resultado) => resultado.faltantes !== 0)) {
      throw new Error('Quedan materiales o cajas sin código')
    }
    for (const resultado of resultados) {
      console.log(`Códigos ${resultado.entidad}: asignados ${resultado.asignados}; faltantes ${resultado.faltantes}`)
    }
  }
  await Paciente.init()
  app.listen(port, '0.0.0.0', () => {
    console.log(`API de SIGCA escuchando en el puerto ${port}`)
  })
} catch (error) {
  console.error('No se pudo iniciar la API:', error.message)
  await mongoose.disconnect().catch(() => {})
  process.exitCode = 1
}
