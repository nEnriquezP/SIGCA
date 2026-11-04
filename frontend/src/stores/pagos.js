import { ref } from 'vue'
import { defineStore } from 'pinia'

const CLAVE = 'sigca_pago_intento'

function leerIntento() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE) || 'null')
    return datos && typeof datos === 'object' &&
      typeof datos.solicitudId === 'string' ? datos : null
  } catch {
    return null
  }
}

export const usePagosStore = defineStore('pagos', () => {
  const intento = ref(leerIntento())

  function coincide(usuario, cita, montoCentavos, metodo) {
    return intento.value?.usuario === usuario && intento.value?.cita === cita &&
      intento.value?.montoCentavos === montoCentavos && intento.value?.metodo === metodo
  }

  function solicitudPara(usuario, cita, montoCentavos, metodo) {
    if (coincide(usuario, cita, montoCentavos, metodo)) return intento.value.solicitudId
    const nuevo = { usuario, cita, montoCentavos, metodo, solicitudId: crypto.randomUUID() }
    intento.value = nuevo
    sessionStorage.setItem(CLAVE, JSON.stringify(nuevo))
    return nuevo.solicitudId
  }

  function limpiar() {
    intento.value = null
    sessionStorage.removeItem(CLAVE)
  }

  return { intento, coincide, solicitudPara, limpiar }
})
