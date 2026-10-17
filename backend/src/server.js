import 'dotenv/config'
import app from './app.js'
import { conectarBaseDeDatos } from './config/db.js'

const port = Number(process.env.PORT) || 3000

try {
  await conectarBaseDeDatos()
  app.listen(port, () => {
    console.log(`API de SIGCA disponible en http://localhost:${port}`)
  })
} catch (error) {
  console.error('No se pudo iniciar la API:', error.message)
  process.exitCode = 1
}
