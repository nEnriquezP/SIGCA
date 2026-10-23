import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { manejarError, rutaNoEncontrada } from './middleware/errorHandler.js'

const app = express()

app.use(cors({
  origin(origenSolicitud, callback) {
    const origenPermitido = process.env.CORS_ORIGIN
    callback(null, Boolean(origenPermitido && origenSolicitud === origenPermitido))
  },
}))
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ estado: 'no disponible' })
  }

  res.json({ estado: 'ok' })
})

app.use(rutaNoEncontrada)
app.use(manejarError)

export default app
