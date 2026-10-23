export function rutaNoEncontrada(req, res, next) {
  const error = new Error('Ruta no encontrada')
  error.status = 404
  next(error)
}

export function manejarError(error, req, res, next) {
  const status = error.name === 'ValidationError' || error.name === 'CastError' ? 400 :
    error.status ?? 500

  if (status >= 500) {
    console.error('Error interno del servidor:', error.name)
  }

  res.status(status).json({
    mensaje: status >= 500 ? 'Error interno del servidor' :
      error.name === 'ValidationError' || error.name === 'CastError' ?
        'Datos inválidos' : error.message,
  })
}
