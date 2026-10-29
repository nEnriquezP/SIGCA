import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import mongoose from 'mongoose'
import { manejarError, rutaNoEncontrada } from './middleware/errorHandler.js'
import rutasAuth from './routes/auth.js'
import rutasUsuarios from './routes/usuarios.js'
import rutasPacientes from './routes/pacientes.js'
import rutasResponsables from './routes/responsables.js'
import rutasServicios from './routes/servicios.js'
import rutasHorarios from './routes/horarios.js'
import rutasContenido from './routes/contenido.js'
import rutasPublicaciones from './routes/publicaciones.js'
import rutasActividades from './routes/actividades.js'
import rutasMensajesContacto from './routes/mensajesContacto.js'
import rutasSolicitudesCita from './routes/solicitudesCita.js'
import rutasImagenes from './routes/imagenes.js'
import rutasCitas from './routes/citas.js'
import rutasRoles from './routes/roles.js'

const app = express()

if (process.env.RENDER === 'true') app.set('trust proxy', 1)

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

app.use('/api/auth', rutasAuth)
app.use('/api/usuarios', rutasUsuarios)
app.use('/api/roles', rutasRoles)
app.use('/api/pacientes', rutasPacientes)
app.use('/api/responsables', rutasResponsables)
app.use('/api/servicios', rutasServicios)
app.use('/api/horarios', rutasHorarios)
app.use('/api/contenido', rutasContenido)
app.use('/api/publicaciones', rutasPublicaciones)
app.use('/api/actividades', rutasActividades)
app.use('/api/mensajes-contacto', rutasMensajesContacto)
app.use('/api/solicitudes-cita', rutasSolicitudesCita)
app.use('/api/citas', rutasCitas)
app.use('/api/imagenes', rutasImagenes)

app.use(rutaNoEncontrada)
app.use(manejarError)

export default app
