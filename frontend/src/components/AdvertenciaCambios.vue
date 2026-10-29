<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({ abierto: { type: Boolean, required: true } })
const emit = defineEmits(['seguir', 'salir'])
const dialogo = ref(null)

watch(() => props.abierto, async (abierto) => {
  await nextTick()
  if (abierto && !dialogo.value?.open) dialogo.value?.showModal()
  if (!abierto && dialogo.value?.open) dialogo.value.close()
}, { flush: 'post' })
</script>

<template>
  <dialog ref="dialogo" class="dialogo-cambios" aria-labelledby="titulo-cambios"
    @cancel.prevent="emit('seguir')">
    <h2 id="titulo-cambios">Tienes cambios sin guardar</h2>
    <p>Si sales ahora, se perderá lo que escribiste o seleccionaste en el formulario.</p>
    <div class="acciones">
      <button type="button" autofocus @click="emit('seguir')">Seguir editando</button>
      <button type="button" class="secundario" @click="emit('salir')">Salir sin guardar</button>
    </div>
  </dialog>
</template>
