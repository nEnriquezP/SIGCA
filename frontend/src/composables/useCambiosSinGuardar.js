import { onMounted, onUnmounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

export function useCambiosSinGuardar(hayCambios) {
  const advertenciaVisible = ref(false)
  let resolver = null

  function responder(salir) {
    advertenciaVisible.value = false
    const pendiente = resolver
    resolver = null
    pendiente?.(salir)
  }

  function confirmarSalida() {
    if (!hayCambios.value) return Promise.resolve(true)
    if (resolver) return Promise.resolve(false)
    advertenciaVisible.value = true
    return new Promise((resolverPromesa) => { resolver = resolverPromesa })
  }

  function advertirAlCerrar(evento) {
    if (!hayCambios.value) return
    evento.preventDefault()
    evento.returnValue = ''
  }

  onBeforeRouteLeave(() => confirmarSalida())
  onMounted(() => window.addEventListener('beforeunload', advertirAlCerrar))
  onUnmounted(() => {
    window.removeEventListener('beforeunload', advertirAlCerrar)
    responder(false)
  })

  return {
    advertenciaVisible,
    confirmarSalida,
    seguirEditando: () => responder(false),
    salirSinGuardar: () => responder(true),
  }
}
