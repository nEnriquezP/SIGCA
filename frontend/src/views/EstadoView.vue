<script setup>
import { onMounted, ref } from 'vue'
import { obtenerEstadoApi } from '../services/api.js'

const estadoApi = ref('Comprobando...')

onMounted(async () => {
  try {
    await obtenerEstadoApi()
    estadoApi.value = 'Conectada'
  } catch {
    estadoApi.value = 'No disponible'
  }
})
</script>

<template>
  <main class="pagina-inicial">
    <h1>Estado de SIGCA</h1>
    <p>Frontend: OK</p>
    <p>API: {{ estadoApi }}</p>
    <RouterLink to="/">Volver al inicio</RouterLink>
  </main>
</template>
