<script setup>
import { ref, watch } from 'vue'
import { obtenerImagenPrivada } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const props = defineProps({ valor: { type: String, default: '' }, alt: { type: String, default: 'Imagen' },
  silueta: { type: Boolean, default: false } })
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
  if (!valor.startsWith('/api/imagenes/privadas/') && !valor.startsWith('/api/citas/')) {
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
    <svg v-else-if="silueta" viewBox="0 0 80 80" role="img" aria-label="Silueta gris sin fotografía">
      <circle cx="40" cy="40" r="40" fill="#dce2e8" />
      <circle cx="40" cy="29" r="15" fill="#8795a3" />
      <path d="M11 80c2-17 13-27 29-27s27 10 29 27" fill="#8795a3" />
    </svg>
    <p v-if="error" class="mensaje-error" role="status">{{ error }}</p>
  </div>
</template>
