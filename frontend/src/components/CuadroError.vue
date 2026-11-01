<script setup>
import { nextTick, ref, watch } from 'vue'
import { cerrarError, errorActual } from '../services/avisos.js'

const dialogo = ref(null)
let focoAnterior = null
let campoMarcado = null

function limpiarCampo() {
  if (!campoMarcado) return
  campoMarcado.removeAttribute('aria-invalid')
  campoMarcado.closest('label')?.removeAttribute('data-error-campo')
  campoMarcado = null
}
function cerrar() {
  dialogo.value?.close()
  cerrarError()
  limpiarCampo()
  focoAnterior?.focus?.()
}
watch(errorActual, async (error) => {
  await nextTick()
  if (!error) return
  if (!dialogo.value?.open) {
    focoAnterior = document.activeElement
    dialogo.value?.showModal()
  }
  limpiarCampo()
  if (error.campo) {
    const campo = document.querySelector(`[data-campo="${error.campo}"]`)
    if (campo) {
      campoMarcado = campo
      campo.setAttribute('aria-invalid', 'true')
      campo.closest('label')?.setAttribute('data-error-campo', 'Revisa este campo')
    }
  }
  dialogo.value?.querySelector('button')?.focus()
})
</script>

<template>
  <dialog ref="dialogo" class="cuadro-error" role="alertdialog" aria-labelledby="titulo-error"
    aria-describedby="mensaje-error-cuadro" @cancel.prevent="cerrar">
    <h2 id="titulo-error">Revisa esta operación</h2>
    <p id="mensaje-error-cuadro">{{ errorActual?.mensaje }}</p>
    <button type="button" @click="cerrar">Cerrar y corregir</button>
  </dialog>
</template>
