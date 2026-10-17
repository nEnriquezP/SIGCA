export function rutaNoEncontrada(req, res, next) {
  const error = new Error(`Ruta no encontrada: ${req.method} ${req.originalUrl}`)
  error.status = 404
  next(error)
}

export function manejarError(error, req, res, next) {
  const status = error.status ?? 500

  if (status >= 500) {
    console.error(error)
  }

  res.status(status).json({
    mensaje: status >= 500 ? 'Error interno del servidor' : error.message,
  })
}
