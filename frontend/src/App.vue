<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSesionStore } from './stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()

onMounted(() => {
  sesion.restaurar()
})

function salir() {
  sesion.cerrar()
  router.push({ name: 'inicio' })
}
</script>

<template>
  <header class="barra-principal">
    <RouterLink class="marca" to="/">SIGCA</RouterLink>
    <nav aria-label="Navegación principal">
      <RouterLink to="/">Inicio</RouterLink>
      <RouterLink to="/estado">Estado</RouterLink>
      <RouterLink to="/servicios">Servicios</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/gestion-servicios">Servicios internos</RouterLink>
      <RouterLink to="/horarios">Horarios</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/gestion-horarios">Horarios internos</RouterLink>
      <RouterLink v-if="sesion.usuario?.rol === 'ADMINISTRADOR'" to="/usuarios">Usuarios</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/pacientes">Pacientes</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/responsables">Responsables</RouterLink>
      <RouterLink v-if="sesion.autenticado" to="/mi-password">Mi contraseña</RouterLink>
      <button v-if="sesion.autenticado" type="button" @click="salir">Salir</button>
      <RouterLink v-else to="/ingresar">Ingresar</RouterLink>
    </nav>
  </header>
  <RouterView />
</template>
