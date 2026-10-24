<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSesionStore } from './stores/sesion.js'
import { solicitarApi } from './services/api.js'

const router = useRouter()
const sesion = useSesionStore()
const identidad = ref(null)

async function cargarIdentidad() {
  try {
    identidad.value = (await solicitarApi('/api/contenido')).contenido
  } catch {
    identidad.value = null
  }
}

onMounted(() => {
  sesion.restaurar()
  cargarIdentidad()
})

function salir() {
  sesion.cerrar()
  router.push({ name: 'inicio' })
}
</script>

<template>
  <header class="barra-principal">
    <RouterLink class="marca" to="/">
      <img v-if="identidad?.logo" :src="identidad.logo" alt="Logotipo del centro" />
      <span>{{ identidad?.nombreCentro || 'SIGCA' }}</span>
    </RouterLink>
    <nav aria-label="Navegación principal">
      <RouterLink to="/">Inicio</RouterLink>
      <RouterLink to="/estado">Estado</RouterLink>
      <RouterLink to="/servicios">Servicios</RouterLink>
      <RouterLink to="/solicitar-cita">Solicitar cita</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/gestion-solicitudes">Solicitudes</RouterLink>
      <RouterLink to="/educacion">Educación</RouterLink>
      <RouterLink to="/corporativo">Corporativo</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/gestion-servicios">Servicios internos</RouterLink>
      <RouterLink to="/horarios">Horarios</RouterLink>
      <RouterLink to="/contacto">Contacto</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/gestion-horarios">Horarios internos</RouterLink>
      <RouterLink v-if="sesion.usuario?.rol === 'ADMINISTRADOR'" to="/administracion-portal">Administrar portal</RouterLink>
      <RouterLink v-if="sesion.usuario?.rol === 'ADMINISTRADOR'" to="/usuarios">Usuarios</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/pacientes">Pacientes</RouterLink>
      <RouterLink v-if="['ADMINISTRADOR', 'RECEPCIONISTA'].includes(sesion.usuario?.rol)" to="/responsables">Responsables</RouterLink>
      <RouterLink v-if="sesion.autenticado" to="/mi-password">Mi contraseña</RouterLink>
      <button v-if="sesion.autenticado" type="button" @click="salir">Salir</button>
      <RouterLink v-else to="/ingresar">Ingresar</RouterLink>
    </nav>
  </header>
  <RouterView @contenido-actualizado="cargarIdentidad" />
  <footer class="pie-pagina">
    <p>{{ identidad?.nombreCentro || 'SIGCA' }}</p>
    <nav aria-label="Navegación del pie de página">
      <RouterLink to="/">Inicio</RouterLink>
      <RouterLink to="/servicios">Servicios</RouterLink>
      <RouterLink to="/solicitar-cita">Solicitar cita</RouterLink>
      <RouterLink to="/educacion">Educación</RouterLink>
      <RouterLink to="/corporativo">Corporativo</RouterLink>
      <RouterLink to="/horarios">Horarios</RouterLink>
      <RouterLink to="/contacto">Contacto</RouterLink>
    </nav>
  </footer>
</template>
