import 'dotenv/config'
import app from './app.js'
import { conectarBaseDeDatos } from './config/db.js'
import Paciente from './models/Paciente.js'

const port = Number(process.env.PORT) || 3000

try {
  await conectarBaseDeDatos()
  await Paciente.init()
  app.listen(port, '0.0.0.0', () => {
    console.log(`API de SIGCA escuchando en el puerto ${port}`)
  })
} catch (error) {
  console.error('No se pudo iniciar la API:', error.message)
  process.exitCode = 1
}
