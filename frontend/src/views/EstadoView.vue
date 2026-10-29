<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { obtenerEstadoApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const route = useRoute()
const sesion = useSesionStore()
const estadoApi = ref('Comprobando...')
const esPanel = computed(() => Boolean(route.meta.requiereSesion))
const destinoVolver = computed(() => {
  if (!esPanel.value) return '/'
  if (sesion.usuario?.rol === 'ADMINISTRADOR') return '/administracion-portal'
  if (sesion.tienePermiso('SOLICITUDES_VER')) return '/gestion-solicitudes'
  if (sesion.tienePermiso('PACIENTES_VER')) return '/pacientes'
  if (sesion.tienePermiso('RESPONSABLES_VER')) return '/responsables'
  if (sesion.tienePermiso('SERVICIOS_VER')) return '/gestion-servicios'
  if (sesion.tienePermiso('HORARIOS_VER')) return '/gestion-horarios'
  return '/mi-password'
})

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
  <main :class="esPanel ? 'contenedor' : 'pagina-inicial'">
    <h1>Estado de SIGCA</h1>
    <p>Frontend: OK</p>
    <p>API: {{ estadoApi }}</p>
    <RouterLink :to="destinoVolver">{{ esPanel ? 'Volver al panel' : 'Volver al inicio' }}</RouterLink>
  </main>
</template>
