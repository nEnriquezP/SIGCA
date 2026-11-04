<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSesionStore } from './stores/sesion.js'
import { solicitarApi } from './services/api.js'
import AvatarUsuario from './components/AvatarUsuario.vue'
import CuadroError from './components/CuadroError.vue'
import { mostrarError } from './services/avisos.js'
import { limpiarMarcaSiValido, marcarCampoInvalido } from './utils/estadoFormulario.js'

const route = useRoute()
const router = useRouter()
const sesion = useSesionStore()
const identidad = ref(null)
const lateralAbierto = ref(false)
const publicoAbierto = ref(false)
const cuentaMenu = ref(null)
const informacionMenu = ref(null)
const botonLateral = ref(null)
const botonPublico = ref(null)

const grupos = [
  {
    titulo: 'Atención',
    opciones: [
      { texto: 'Solicitudes', ruta: '/gestion-solicitudes', permiso: 'SOLICITUDES_VER', icono: 'M4 5h16v14H4z M4 9h16 M8 13h8 M8 16h5' },
      { texto: 'Citas', ruta: '/citas', permiso: 'CITAS_VER', icono: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h4 M8 18h7' },
      { texto: 'Calendario', ruta: '/calendario', permiso: 'CITAS_VER', icono: 'M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18 M8 14h3 M14 14h3 M8 18h3' },
      { texto: 'Pacientes', ruta: '/pacientes', permiso: 'PACIENTES_VER', icono: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 7h5 M19.5 4.5v5' },
      { texto: 'Responsables', ruta: '/responsables', permiso: 'RESPONSABLES_VER', icono: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 20v-2a4 4 0 0 0-3-3.87 M16 2.13a4 4 0 0 1 0 7.75' },
      { texto: 'Materiales educativos', ruta: '/materiales', permiso: 'MATERIALES_VER', icono: 'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5' },
      { texto: 'Pagos', ruta: '/pagos', permiso: 'PAGOS_VER', icono: 'M3 6h18v12H3z M3 10h18 M7 15h4' },
    ],
  },
  {
    titulo: 'Operación',
    opciones: [
      { texto: 'Servicios internos', ruta: '/gestion-servicios', permiso: 'SERVICIOS_VER', icono: 'M3 7h18v14H3z M3 7l3-4h12l3 4 M8 12h8 M12 10v5' },
      { texto: 'Horarios internos', ruta: '/gestion-horarios', permiso: 'HORARIOS_VER', icono: 'M3 5h18v16H3z M7 3v4 M17 3v4 M3 10h18 M8 14h3 M14 14h3 M8 18h3' },
    ],
  },
  {
    titulo: 'Administración',
    opciones: [
      { texto: 'Administrar portal', ruta: '/administracion-portal', permiso: 'PORTAL_GESTIONAR', icono: 'M3 4h18v16H3z M3 9h18 M8 14h8 M8 17h5' },
      { texto: 'Usuarios', ruta: '/usuarios', permiso: 'USUARIOS_GESTIONAR', icono: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 8h5 M19.5 5.5v5' },
    ],
  },
  {
    titulo: 'Sistema',
    opciones: [
      { texto: 'Estado del sistema', ruta: '/estado-sistema', icono: 'M3 12h4l3-7 4 14 3-7h4' },
    ],
  },
]

const gruposVisibles = computed(() => grupos
  .map((grupo) => ({
    ...grupo,
    opciones: grupo.opciones.filter((opcion) => sesion.autenticado &&
      (!opcion.permiso || sesion.tienePermiso(opcion.permiso))),
  }))
  .filter((grupo) => grupo.opciones.length))
const esPanel = computed(() => Boolean(route.meta.requiereSesion))
const opcionActual = computed(() => grupos
  .flatMap((grupo) => grupo.opciones.map((opcion) => ({ ...opcion, grupo: grupo.titulo })))
  .find((opcion) => opcion.ruta === route.path))
const ubicacion = computed(() => opcionActual.value
  ? [opcionActual.value.grupo, opcionActual.value.texto]
  : ['Cuenta', route.path === '/mi-cuenta' ? 'Mi cuenta' : 'Mi contraseña'])
const nombreCentro = computed(() => identidad.value?.nombreCentro || 'Centro Médico Jalapa')
const nombreCuenta = computed(() => {
  const usuario = sesion.usuario
  return usuario?.nombre || usuario?.correo || usuario?.rol || 'Mi cuenta'
})
const destinoPanel = computed(() => {
  if (sesion.usuario?.rol === 'ADMINISTRADOR') return '/administracion-portal'
  return gruposVisibles.value.flatMap((grupo) => grupo.opciones)
    .find((opcion) => opcion.ruta !== '/estado-sistema')?.ruta || '/'
})

async function cargarIdentidad() {
  try {
    identidad.value = (await solicitarApi('/api/contenido')).contenido
  } catch {
    identidad.value = null
  }
}

function cerrarMenus() {
  lateralAbierto.value = false
  publicoAbierto.value = false
  if (cuentaMenu.value) cuentaMenu.value.open = false
  if (informacionMenu.value) informacionMenu.value.open = false
}

function cerrarAlSalir(evento) {
  if (cuentaMenu.value && !cuentaMenu.value.contains(evento.target)) cuentaMenu.value.open = false
  if (informacionMenu.value && !informacionMenu.value.contains(evento.target)) informacionMenu.value.open = false
}

function cerrarConEscape(evento) {
  if (evento.key !== 'Escape') return
  if (cuentaMenu.value?.open) {
    cuentaMenu.value.open = false
    cuentaMenu.value.querySelector('summary')?.focus()
  } else if (informacionMenu.value?.open) {
    informacionMenu.value.open = false
    informacionMenu.value.querySelector('summary')?.focus()
  } else if (lateralAbierto.value) {
    lateralAbierto.value = false
    botonLateral.value?.focus()
  } else if (publicoAbierto.value) {
    publicoAbierto.value = false
    botonPublico.value?.focus()
  }
}

function avisarCampoInvalido(evento) {
  marcarCampoInvalido(evento, mostrarError)
}

watch(() => route.fullPath, cerrarMenus)

onMounted(() => {
  sesion.restaurar()
  cargarIdentidad()
  document.addEventListener('pointerdown', cerrarAlSalir)
  document.addEventListener('keydown', cerrarConEscape)
  document.addEventListener('invalid', avisarCampoInvalido, true)
  document.addEventListener('input', limpiarMarcaSiValido)
  document.addEventListener('change', limpiarMarcaSiValido)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', cerrarAlSalir)
  document.removeEventListener('keydown', cerrarConEscape)
  document.removeEventListener('invalid', avisarCampoInvalido, true)
  document.removeEventListener('input', limpiarMarcaSiValido)
  document.removeEventListener('change', limpiarMarcaSiValido)
})

async function salir() {
  const cancelada = await router.push({ name: 'inicio' })
  if (cancelada) return
  cerrarMenus()
  sesion.cerrar()
}
</script>

<template>
  <div v-if="esPanel" class="aplicacion-panel">
    <header class="cabecera-panel">
      <div class="cabecera-panel-izquierda">
        <button ref="botonLateral" class="boton-menu boton-lateral" type="button"
          :aria-label="lateralAbierto ? 'Cerrar menú del panel' : 'Abrir menú del panel'"
          aria-controls="navegacion-panel"
          :aria-expanded="lateralAbierto" @click="lateralAbierto = !lateralAbierto">
          <span aria-hidden="true">☰</span>
        </button>
        <RouterLink class="marca marca-panel" to="/" @click="cerrarMenus">
          <img v-if="identidad?.logo" :src="identidad.logo" alt="" />
          <svg v-else class="marca-simbolo" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path d="M24 4 43 12v12c0 11-7 17-19 20C12 41 5 35 5 24V12L24 4Z" stroke="currentColor" stroke-width="3" />
            <path d="M24 14v20M14 24h20" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
          </svg>
          <span>{{ nombreCentro }}</span>
        </RouterLink>
      </div>
      <strong class="titulo-panel">Panel interno</strong>
      <div class="acciones-panel">
        <RouterLink class="enlace-portal" to="/" @click="cerrarMenus">Ver portal público</RouterLink>
        <details ref="cuentaMenu" class="menu-desplegable menu-cuenta">
          <summary aria-label="Menú de cuenta">
            <AvatarUsuario :usuario="sesion.usuario" tamano="pequeno" />
            <span class="nombre-cuenta">{{ nombreCuenta }}</span>
            <span class="flecha-menu" aria-hidden="true">⌄</span>
          </summary>
          <div class="contenido-menu">
            <RouterLink to="/mi-cuenta" @click="cerrarMenus">Mi cuenta</RouterLink>
            <RouterLink to="/mi-password" @click="cerrarMenus">Mi contraseña</RouterLink>
            <button type="button" @click="salir">Salir</button>
          </div>
        </details>
      </div>
    </header>
    <div class="estructura-panel">
      <button v-if="lateralAbierto" class="fondo-lateral" type="button"
        aria-label="Cerrar menú del panel" @click="lateralAbierto = false"></button>
      <aside id="navegacion-panel" class="lateral-panel" :class="{ abierta: lateralAbierto }">
        <nav aria-label="Navegación del panel">
          <section v-for="grupo in gruposVisibles" :key="grupo.titulo" class="grupo-lateral">
            <h2>{{ grupo.titulo }}</h2>
            <RouterLink v-for="opcion in grupo.opciones" :key="opcion.ruta" :to="opcion.ruta"
              class="enlace-lateral" :class="{ activo: route.path === opcion.ruta }"
              :aria-current="route.path === opcion.ruta ? 'page' : undefined" @click="cerrarMenus">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path :d="opcion.icono" />
              </svg>
              <span>{{ opcion.texto }}</span>
            </RouterLink>
          </section>
        </nav>
      </aside>
      <div class="contenido-panel">
        <nav class="migas-panel" aria-label="Ruta actual">
          <span>{{ ubicacion[0] }}</span><span aria-hidden="true">/</span>
          <strong aria-current="page">{{ ubicacion[1] }}</strong>
        </nav>
        <RouterView @contenido-actualizado="cargarIdentidad" />
      </div>
    </div>
  </div>
  <div v-else class="aplicacion-publica">
    <header class="cabecera-publica">
      <RouterLink class="marca marca-publica" to="/" @click="cerrarMenus">
        <img v-if="identidad?.logo" :src="identidad.logo" alt="" />
        <svg v-else class="marca-simbolo" viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path d="M24 4 43 12v12c0 11-7 17-19 20C12 41 5 35 5 24V12L24 4Z" stroke="currentColor" stroke-width="3" />
          <path d="M24 14v20M14 24h20" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
        </svg>
        <span>{{ nombreCentro }}</span>
      </RouterLink>
      <button ref="botonPublico" class="boton-menu boton-publico" type="button"
        :aria-label="publicoAbierto ? 'Cerrar navegación pública' : 'Abrir navegación pública'"
        aria-controls="navegacion-publica"
        :aria-expanded="publicoAbierto" @click="publicoAbierto = !publicoAbierto">
        <span aria-hidden="true">☰</span>
      </button>
      <nav id="navegacion-publica" class="navegacion-publica" :class="{ abierta: publicoAbierto }"
        aria-label="Navegación pública">
        <RouterLink to="/" @click="cerrarMenus">Inicio</RouterLink>
        <RouterLink to="/servicios" @click="cerrarMenus">Servicios</RouterLink>
        <RouterLink to="/solicitar-cita" @click="cerrarMenus">Solicitar cita</RouterLink>
        <details ref="informacionMenu" class="menu-desplegable menu-informacion">
          <summary>Información <span class="flecha-menu" aria-hidden="true">⌄</span></summary>
          <div class="contenido-menu">
            <RouterLink to="/estado" @click="cerrarMenus">Estado</RouterLink>
            <RouterLink to="/educacion" @click="cerrarMenus">Educación</RouterLink>
            <RouterLink to="/corporativo" @click="cerrarMenus">Corporativo</RouterLink>
            <RouterLink to="/horarios" @click="cerrarMenus">Horarios</RouterLink>
            <RouterLink to="/contacto" @click="cerrarMenus">Contacto</RouterLink>
          </div>
        </details>
      </nav>
      <RouterLink class="acceso-panel" :to="sesion.autenticado ? destinoPanel : '/ingresar'"
        @click="cerrarMenus">{{ sesion.autenticado ? 'Volver al panel' : 'Ingresar' }}</RouterLink>
    </header>
    <RouterView @contenido-actualizado="cargarIdentidad" />
    <footer class="pie-pagina">
      <p>{{ nombreCentro }}</p>
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
  </div>
  <CuadroError />
</template>
