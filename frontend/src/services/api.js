function obtenerUrlBase() {
  const urlBase = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')

  if (!urlBase) {
    throw new Error('Falta VITE_API_URL')
  }

  return urlBase
}

export async function solicitarApi(ruta, { method = 'GET', body, token } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  const respuesta = await fetch(`${obtenerUrlBase()}${ruta}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const datos = await respuesta.json().catch(() => null)

  if (!respuesta.ok) {
    const error = new Error(datos?.mensaje || 'No se pudo completar la solicitud')
    error.status = respuesta.status
    throw error
  }

  return datos
}

export async function obtenerEstadoApi() {
  const datos = await solicitarApi('/api/health')

  if (datos.estado !== 'ok') {
    throw new Error('La API no está disponible')
  }

  return datos
}
