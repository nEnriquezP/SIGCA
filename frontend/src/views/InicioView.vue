<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { solicitarApi } from '../services/api.js'

const contenido = ref(null)
const indice = ref(0)
const cargando = ref(true)
const error = ref('')
const reproduccion = ref('REPRODUCIENDO')
const punteroDentro = ref(false)
const focoDentro = ref(false)
const paginaVisible = ref(true)
const carruselElemento = ref(null)
let temporizador
let preferenciaMovimiento

const parrafos = computed(() => String(contenido.value?.informacionPrincipal || '')
  .split(/\n+/).map((parrafo) => parrafo.trim()).filter(Boolean))
const intervalo = computed(() => {
  const segundos = Number(contenido.value?.carruselIntervalo)
  return Number.isInteger(segundos) && segundos >= 4 && segundos <= 10 ? segundos : 6
})
const transicion = computed(() => contenido.value?.carruselTransicion === 'DESLIZAR'
  ? 'carrusel-deslizar' : 'carrusel-desvanecer')
const reproduciendo = computed(() => reproduccion.value === 'REPRODUCIENDO' &&
  !punteroDentro.value && !focoDentro.value && paginaVisible.value &&
  (contenido.value?.carrusel?.length || 0) > 1)

function programar() {
  clearTimeout(temporizador)
  if (reproduciendo.value) temporizador = setTimeout(() => mover(1), intervalo.value * 1000)
}

function mover(pasos) {
  const total = contenido.value?.carrusel?.length || 0
  if (total) indice.value = (indice.value + pasos + total) % total
  programar()
}

function irA(nuevoIndice) {
  indice.value = nuevoIndice
  programar()
}

function detener() {
  reproduccion.value = 'DETENIDO'
  indice.value = 0
}

function focoSalio(evento) {
  if (!carruselElemento.value?.contains(evento.relatedTarget)) focoDentro.value = false
}

function cambioVisibilidad() {
  paginaVisible.value = !document.hidden
}

function cambioMovimiento(evento) {
  if (evento.matches) reproduccion.value = 'PAUSADO'
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    contenido.value = (await solicitarApi('/api/contenido')).contenido
    indice.value = 0
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    cargando.value = false
  }
}

watch([reproduciendo, intervalo], programar)
onMounted(() => {
  preferenciaMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (preferenciaMovimiento?.matches) reproduccion.value = 'PAUSADO'
  preferenciaMovimiento?.addEventListener?.('change', cambioMovimiento)
  document.addEventListener('visibilitychange', cambioVisibilidad)
  cargar()
})
onUnmounted(() => {
  clearTimeout(temporizador)
  preferenciaMovimiento?.removeEventListener?.('change', cambioMovimiento)
  document.removeEventListener('visibilitychange', cambioVisibilidad)
})
</script>

<template>
  <main class="inicio-publico">
    <section class="portal-hero">
      <div class="portal-hero-interior">
        <div class="portal-hero-texto">
          <h1>Un espacio para escuchar, comprender y acompañar</h1>
          <p v-if="parrafos.length" class="portal-hero-descripcion">{{ parrafos[0] }}</p>
          <p v-else-if="!cargando && !error">La información del centro aún no está publicada.</p>
          <p v-if="cargando" role="status">Cargando información del centro…</p>
          <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
          <button v-if="error" type="button" class="secundario" @click="cargar">Reintentar</button>
          <div class="portal-hero-acciones">
            <RouterLink class="portal-accion-primaria" to="/solicitar-cita">Solicitar cita</RouterLink>
            <RouterLink class="portal-accion-secundaria" to="/servicios">Conocer servicios</RouterLink>
          </div>
        </div>
        <section v-if="contenido?.carrusel?.length" ref="carruselElemento" class="carrusel"
          aria-label="Imágenes del centro" aria-roledescription="carrusel"
          @mouseenter="punteroDentro = true" @mouseleave="punteroDentro = false"
          @focusin="focoDentro = true" @focusout="focoSalio">
          <div class="carrusel-escena" :aria-live="reproduciendo ? 'off' : 'polite'">
            <Transition :name="transicion">
              <img :key="indice" :src="contenido.carrusel[indice]"
                :alt="`Imagen ${indice + 1} de ${contenido.carrusel.length} del centro`" />
            </Transition>
            <button v-if="contenido.carrusel.length > 1" type="button" class="carrusel-flecha carrusel-anterior"
              aria-label="Imagen anterior" @click="mover(-1)">‹</button>
            <button v-if="contenido.carrusel.length > 1" type="button" class="carrusel-flecha carrusel-siguiente"
              aria-label="Imagen siguiente" @click="mover(1)">›</button>
          </div>
          <div class="carrusel-controles">
            <span class="carrusel-conteo">{{ indice + 1 }} de {{ contenido.carrusel.length }}</span>
            <div class="carrusel-indicadores" aria-label="Elegir imagen">
              <button v-for="(_, posicion) in contenido.carrusel" :key="posicion" type="button"
                :class="{ activo: posicion === indice }" :aria-label="`Mostrar imagen ${posicion + 1}`"
                :aria-current="posicion === indice ? 'true' : undefined" @click="irA(posicion)"></button>
            </div>
            <div class="carrusel-reproduccion">
              <button v-if="reproduccion === 'REPRODUCIENDO'" type="button" class="carrusel-control"
                @click="reproduccion = 'PAUSADO'">Pausar</button>
              <button v-else type="button" class="carrusel-control"
                @click="reproduccion = 'REPRODUCIENDO'">Reproducir</button>
              <button type="button" class="carrusel-control" :disabled="reproduccion === 'DETENIDO'"
                @click="detener">Detener</button>
            </div>
          </div>
        </section>
      </div>
    </section>

    <div class="contenedor portal-inicio-contenido">
      <section class="portal-accesos" aria-label="Secciones principales">
        <RouterLink class="portal-acceso" to="/servicios">
          <span class="portal-acceso-icono" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 27C8 23 4 18 4 12a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 6-4 11-12 15Z" />
              <path d="M10 17h4l2-4 2 7 2-3h3" />
            </svg>
          </span>
          <span><strong>Atención psicológica</strong><small>Conoce los servicios de acompañamiento profesional.</small></span>
          <span class="portal-acceso-flecha" aria-hidden="true">›</span>
        </RouterLink>
        <RouterLink class="portal-acceso" to="/servicios">
          <span class="portal-acceso-icono" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 26c-1 3-6 3-6 0 0-3 3-4 3-7 0-2-4-3-4-7a8 8 0 0 1 16 0c0 5-4 6-4 10" />
              <path d="M15 12c0-4 6-4 6 0 0 3-3 4-3 6" />
              <path d="M28 9c2 3 2 7 0 10" />
            </svg>
          </span>
          <span><strong>Estimulación auditiva verbal</strong><small>Explora las atenciones para la comunicación y el desarrollo.</small></span>
          <span class="portal-acceso-flecha" aria-hidden="true">›</span>
        </RouterLink>
        <RouterLink class="portal-acceso" to="/corporativo">
          <span class="portal-acceso-icono" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="16" cy="9" r="4" /><circle cx="6" cy="15" r="3" /><circle cx="26" cy="15" r="3" />
              <path d="M8 27v-3a8 8 0 0 1 16 0v3M1 26v-3a5 5 0 0 1 5-5m25 8v-3a5 5 0 0 0-5-5" />
            </svg>
          </span>
          <span><strong>Escuela para padres</strong><small>Consulta las actividades y capacitaciones del centro.</small></span>
          <span class="portal-acceso-flecha" aria-hidden="true">›</span>
        </RouterLink>
      </section>

      <section v-if="contenido" class="portal-identidad" aria-label="Identidad institucional">
        <article class="tarjeta"><h2>Misión</h2><p class="texto-preservado">{{ contenido.mision }}</p></article>
        <article class="tarjeta"><h2>Visión</h2><p class="texto-preservado">{{ contenido.vision }}</p></article>
      </section>
      <section v-if="parrafos.length > 1" class="portal-enfoque">
        <h2>Conoce nuestro enfoque</h2>
        <p v-for="(parrafo, posicion) in parrafos.slice(1)" :key="posicion">{{ parrafo }}</p>
      </section>
      <section class="portal-mas" aria-label="Más información">
        <h2>Conoce el centro</h2>
        <div class="portal-mas-enlaces">
          <RouterLink to="/educacion">Publicaciones educativas</RouterLink>
          <RouterLink to="/corporativo">Capacitaciones y actividades</RouterLink>
          <RouterLink to="/horarios">Horarios de atención</RouterLink>
          <RouterLink to="/contacto">Contacto</RouterLink>
        </div>
      </section>
    </div>
  </main>
</template>
