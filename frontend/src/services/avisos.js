import { ref } from 'vue'

export const errorActual = ref(null)
let secuencia = 0

export function mostrarError(mensaje, campo = '') {
  errorActual.value = { id: ++secuencia, mensaje: String(mensaje || 'No se pudo completar la operación'),
    campo }
}

export function cerrarError() { errorActual.value = null }

export function notificarCambio(ruta) {
  const entidad = /^\/api\/(pacientes|responsables|usuarios|roles|servicios|horarios)/.exec(ruta)?.[1]
  if (entidad && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sigca:datos-actualizados', { detail: { entidad } }))
  }
}
