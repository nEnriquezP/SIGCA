import { onMounted, onUnmounted } from 'vue'

export function useOpcionesVivas(actualizar, entidades = []) {
  let temporizador
  let ultimo = 0
  let pendiente = false
  let repetir = false
  function refrescar(forzar = false) {
    if (document.visibilityState !== 'visible') return
    if (pendiente) { if (forzar) repetir = true; return }
    if (!forzar && Date.now() - ultimo < 15000) return
    ultimo = Date.now()
    pendiente = true
    Promise.resolve().then(actualizar).catch(() => {}).finally(() => {
      pendiente = false
      if (repetir) { repetir = false; refrescar(true) }
    })
  }
  function cambio(evento) {
    if (entidades.includes(evento.detail?.entidad)) refrescar(true)
  }
  onMounted(() => {
    window.addEventListener('focus', refrescarSinForzar)
    document.addEventListener('visibilitychange', refrescarSinForzar)
    window.addEventListener('sigca:datos-actualizados', cambio)
    temporizador = window.setInterval(refrescarSinForzar, 60000)
  })
  onUnmounted(() => {
    window.removeEventListener('focus', refrescarSinForzar)
    document.removeEventListener('visibilitychange', refrescarSinForzar)
    window.removeEventListener('sigca:datos-actualizados', cambio)
    window.clearInterval(temporizador)
  })
  function refrescarSinForzar() { refrescar() }
}
