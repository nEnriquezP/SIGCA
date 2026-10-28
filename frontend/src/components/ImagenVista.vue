<script setup>
import { ref, watch } from 'vue'
import { obtenerImagenPrivada } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const props = defineProps({ valor: { type: String, default: '' }, alt: { type: String, default: 'Imagen' } })
const sesion = useSesionStore()
const fuente = ref('')
const error = ref('')

watch(() => props.valor, async (valor, _anterior, alLimpiar) => {
  let activa = true
  let temporal = ''
  alLimpiar(() => {
    activa = false
    if (temporal) URL.revokeObjectURL(temporal)
  })
  fuente.value = ''
  error.value = ''
  if (!valor) return
  if (!valor.startsWith('/api/imagenes/privadas/')) {
    fuente.value = valor
    return
  }
  try {
    const blob = await obtenerImagenPrivada(valor, sesion.token)
    if (!activa) return
    temporal = URL.createObjectURL(blob)
    fuente.value = temporal
  } catch {
    if (activa) error.value = 'No se pudo mostrar la fotografía privada.'
  }
}, { immediate: true })
</script>

<template>
  <div class="imagen-vista">
    <img v-if="fuente" :src="fuente" :alt="alt" referrerpolicy="no-referrer" />
    <p v-if="error" class="mensaje-error" role="status">{{ error }}</p>
  </div>
</template>
