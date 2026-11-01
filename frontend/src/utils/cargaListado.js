import { ref } from 'vue'

// Conserva el último resultado visible y descarta respuestas de búsquedas anteriores.
export function crearCargaListado(solicitar, alFallar = () => {}) {
  const pacientes = ref([])
  const total = ref(0)
  const totalPaginas = ref(1)
  const pagina = ref(0)
  const cargando = ref(false)
  const actualizando = ref(false)
  let cargado = false
  let activo = null
  let version = 0

  function cancelar() {
    version += 1
    activo?.controlador.abort()
    activo = null
  }

  function cargar(parametros, forzar = false) {
    const clave = parametros.toString()
    if (!forzar && activo?.clave === clave) return activo.promesa
    cancelar()
    const actual = version
    const controlador = new AbortController()
    cargando.value = !cargado
    actualizando.value = cargado
    const promesa = (async () => {
      try {
        const datos = await solicitar(parametros, controlador.signal)
        if (actual !== version) return
        pacientes.value = datos.pacientes
        total.value = datos.total
        totalPaginas.value = datos.totalPaginas
        pagina.value = datos.pagina
        cargado = true
      } catch (error) {
        if (actual === version && error.name !== 'AbortError') alFallar(error, cargado)
      } finally {
        if (actual === version) {
          activo = null
          cargando.value = false
          actualizando.value = false
        }
      }
    })()
    activo = { clave, controlador, promesa }
    return promesa
  }

  return { pacientes, total, totalPaginas, pagina, cargando, actualizando, cargar, cancelar }
}
