import { mostrarError, notificarCambio } from './avisos.js'

function obtenerUrlBase() {
  const urlBase = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')

  if (!urlBase) {
    throw new Error('Falta VITE_API_URL')
  }

  return urlBase
}

export async function solicitarApi(ruta, { method = 'GET', body, token, signal,
  silencioso = false } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  let respuesta
  try {
    respuesta = await fetch(`${obtenerUrlBase()}${ruta}`, {
      method, headers, signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    const fallo = new Error('No se pudo conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.')
    if (!silencioso) mostrarError(fallo.message)
    throw fallo
  }
  const datos = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    const error = new Error(datos?.mensaje || 'No se pudo completar la solicitud')
    error.status = respuesta.status
    error.campo = typeof datos?.campo === 'string' ? datos.campo : ''
    if (!silencioso) mostrarError(error.message, error.campo)
    throw error
  }

  if (method !== 'GET') notificarCambio(ruta)
  return datos
}

export async function obtenerEstadoApi() {
  const datos = await solicitarApi('/api/health')

  if (datos.estado !== 'ok') {
    throw new Error('La API no está disponible')
  }

  return datos
}

export async function subirArchivoImagen(categoria, archivo, token) {
  const cuerpo = new FormData()
  if (categoria !== 'usuario') cuerpo.append('categoria', categoria)
  cuerpo.append('archivo', archivo, 'recorte.jpg')
  const ruta = categoria === 'usuario' ? '/api/imagenes/usuario' : '/api/imagenes'
  const respuesta = await fetch(`${obtenerUrlBase()}${ruta}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: cuerpo,
  })
  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const error = new Error(datos?.mensaje || 'No se pudo cargar la imagen')
    error.status = respuesta.status
    mostrarError(error.message)
    throw error
  }
  return datos.imagen.valor
}

export async function obtenerImagenPrivada(ruta, token) {
  const respuesta = await fetch(`${obtenerUrlBase()}${ruta}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  })
  if (!respuesta.ok) {
    const error = new Error('No se pudo mostrar la fotografía privada')
    error.status = respuesta.status
    throw error
  }
  return respuesta.blob()
}
