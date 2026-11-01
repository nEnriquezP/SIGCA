<script setup>
import { nextTick, ref, watch } from 'vue'
import { fechaCorta } from '../utils/formatoCita.js'
import { avisoEspera } from '../utils/fechasCita.js'

const props = defineProps({ datos: { type: Object, default: null }, ocupada: { type: Boolean, default: false } })
const emit = defineEmits(['confirmar', 'volver'])
const dialogo = ref(null)
watch(() => props.datos, async (datos) => {
  await nextTick()
  if (datos && !dialogo.value?.open) dialogo.value?.showModal()
  if (!datos && dialogo.value?.open) dialogo.value.close()
}, { flush: 'post' })
</script>

<template>
  <dialog ref="dialogo" class="dialogo-confirmacion-cita" aria-labelledby="titulo-confirmar-cita"
    @cancel.prevent="ocupada ? null : emit('volver')">
    <h2 id="titulo-confirmar-cita">Confirmar datos de la cita</h2>
    <template v-if="datos">
      <p>Paciente: <strong>{{ datos.paciente }}</strong></p>
      <p>Fecha: <strong>{{ fechaCorta(datos.fecha) }}</strong></p>
      <p>Hora: <strong>{{ datos.hora }} (Guatemala)</strong></p>
      <p>{{ avisoEspera(datos.fecha) }}</p>
    </template>
    <div class="acciones">
      <button type="button" :disabled="ocupada" @click="emit('confirmar')">{{ ocupada ? 'Guardando…' : 'Confirmar cita' }}</button>
      <button type="button" class="secundario" :disabled="ocupada" @click="emit('volver')">Volver a editar</button>
    </div>
  </dialog>
</template>
