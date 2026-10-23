export async function obtenerEstadoApi() {
  const urlBase = import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, '')

  if (!urlBase) {
    throw new Error('Falta VITE_API_URL')
  }

  const respuesta = await fetch(`${urlBase}/api/health`)

  if (!respuesta.ok) {
    throw new Error('La API no está disponible')
  }

  const datos = await respuesta.json()

  if (datos.estado !== 'ok') {
    throw new Error('La API no está disponible')
  }

  return datos
}
