import express from 'express'
import { manejarError, rutaNoEncontrada } from './middleware/errorHandler.js'

const app = express()

app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (req, res) => {
  res.json({ estado: 'ok' })
})

app.use(rutaNoEncontrada)
app.use(manejarError)

export default app
