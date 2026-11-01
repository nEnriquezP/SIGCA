import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { procesarAvisos } from '../services/correo.js'

const router = Router()
router.post('/procesar', async (req, res) => {
  const secreto = process.env.SIGCA_CRON_SECRET
  const recibido = req.get('authorization')?.replace(/^Bearer /, '') ?? ''
  if (!secreto || !recibido || Buffer.byteLength(secreto) !== Buffer.byteLength(recibido) ||
      !timingSafeEqual(Buffer.from(secreto), Buffer.from(recibido))) {
    return res.status(401).json({ mensaje: 'Acceso no permitido' })
  }
  res.json(await procesarAvisos())
})
export default router
