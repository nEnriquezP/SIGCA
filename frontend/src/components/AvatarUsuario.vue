<script setup>
import { computed, ref, watch } from 'vue'
import { obtenerImagenPrivada } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { avatares } from '../data/avatares.js'

const props = defineProps({ usuario: { type: Object, default: null }, tamano: { type: String, default: 'normal' } })
const sesion = useSesionStore()
const fuente = ref('')
const opcion = computed(() => avatares.find((avatar) => avatar.id === props.usuario?.avatar))

watch(() => props.usuario?.fotografia, async (fotografia, _anterior, alLimpiar) => {
  let vigente = true
  let temporal = ''
  alLimpiar(() => {
    vigente = false
    if (temporal) URL.revokeObjectURL(temporal)
  })
  fuente.value = ''
  if (!fotografia) return
  try {
    const blob = await obtenerImagenPrivada(fotografia, sesion.token)
    if (!vigente) return
    temporal = URL.createObjectURL(blob)
    fuente.value = temporal
  } catch {
    // Si falla la descarga, se muestra el avatar elegido o la silueta gris.
  }
}, { immediate: true })
</script>

<template>
  <span class="avatar-usuario" :class="`avatar-usuario-${tamano}`" role="img"
    :aria-label="fuente ? 'Fotografía de perfil' : opcion ? `Avatar ${opcion.nombre}` : 'Avatar gris sin fotografía'">
    <img v-if="fuente" :src="fuente" alt="" />
    <svg v-else-if="opcion" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="40" :fill="opcion.fondo" />
      <path v-if="opcion.largo" d="M20 45V31c0-15 9-23 20-23s20 8 20 23v17l-8 4H28Z" :fill="opcion.cabello" />
      <path d="M10 80c2-19 14-29 30-29s28 10 30 29" :fill="opcion.ropa" />
      <path d="M34 50v9l6 6 6-6v-9" :fill="opcion.piel" />
      <ellipse cx="40" cy="33" rx="16" ry="20" :fill="opcion.piel" />
      <path v-if="!opcion.largo" d="M24 30c-1-14 8-22 19-21 8 0 14 6 15 15-5-5-10-8-18-7-8 1-12 5-16 13Z" :fill="opcion.cabello" />
      <path v-else d="M24 30c1-12 7-20 19-20 9 0 15 7 15 18-6-7-10-10-18-9-8 1-12 5-16 11Z" :fill="opcion.cabello" />
      <circle cx="34" cy="34" r="1.5" fill="#233047" />
      <circle cx="46" cy="34" r="1.5" fill="#233047" />
      <path d="M36 43c2 2 6 2 8 0" fill="none" stroke="#70483e" stroke-width="1.5" stroke-linecap="round" />
      <path v-if="opcion.cruz" d="M54 62v10m-5-5h10" fill="none" stroke="#1e7192" stroke-width="3" stroke-linecap="round" />
    </svg>
    <svg v-else viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="40" fill="#dce2e8" />
      <circle cx="40" cy="29" r="15" fill="#8795a3" />
      <path d="M11 80c2-17 13-27 29-27s27 10 29 27" fill="#8795a3" />
    </svg>
  </span>
</template>
