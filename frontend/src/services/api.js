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
