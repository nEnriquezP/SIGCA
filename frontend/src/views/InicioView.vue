<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { solicitarApi } from '../services/api.js'

const contenido = ref(null)
const publicacionReciente = ref(null)
const actividadReciente = ref(null)
const horariosPublicados = ref([])
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
  const [principal, publicaciones, actividades, horarios] = await Promise.allSettled([
    solicitarApi('/api/contenido'), solicitarApi('/api/publicaciones'),
    solicitarApi('/api/actividades'), solicitarApi('/api/horarios'),
  ])
  if (principal.status === 'fulfilled') {
    contenido.value = principal.value.contenido
    indice.value = 0
  } else error.value = principal.reason.message
  publicacionReciente.value = publicaciones.status === 'fulfilled'
    ? publicaciones.value.publicaciones?.[0] || null : null
  actividadReciente.value = actividades.status === 'fulfilled'
    ? actividades.value.actividades?.[0] || null : null
  horariosPublicados.value = horarios.status === 'fulfilled' ? horarios.value.horarios || [] : []
  cargando.value = false
}

function nombreActividad(tipo) {
  return { CAPACITACION: 'Capacitación', ESCUELA_PADRES: 'Escuela para padres',
    OTRA: 'Actividad del centro' }[tipo] || 'Actividad del centro'
}

function fechaPublicacion(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return ''
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${fecha}T12:00:00Z`))
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
        <article class="tarjeta">
          <div class="portal-identidad-titulo">
            <span class="portal-identidad-icono" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="16" cy="16" r="12" /><circle cx="16" cy="16" r="7" /><circle cx="16" cy="16" r="2" />
                <path d="m16 16 8-8" />
              </svg>
            </span>
            <h2>Misión</h2>
          </div>
          <p class="texto-preservado">{{ contenido.mision }}</p>
        </article>
        <article class="tarjeta">
          <div class="portal-identidad-titulo">
            <span class="portal-identidad-icono" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 16s5-8 13-8 13 8 13 8-5 8-13 8S3 16 3 16Z" /><circle cx="16" cy="16" r="4" />
                <path d="M16 2v3m0 22v3M2 8l2 2m24 12 2 2" />
              </svg>
            </span>
            <h2>Visión</h2>
          </div>
          <p class="texto-preservado">{{ contenido.vision }}</p>
        </article>
      </section>
      <section v-if="parrafos.length > 1" class="portal-enfoque">
        <div class="portal-enfoque-visual">
          <img v-if="contenido?.carrusel?.[0]" :src="contenido.carrusel[0]" alt="Imagen del centro que acompaña su enfoque de atención" loading="lazy" />
          <div v-else class="portal-enfoque-decoracion" aria-hidden="true">✦</div>
        </div>
        <div class="portal-enfoque-texto">
          <span class="portal-etiqueta">Nuestra manera de acompañarte</span>
          <h2>Conoce nuestro enfoque</h2>
          <p v-for="(parrafo, posicion) in parrafos.slice(1)" :key="posicion">{{ parrafo }}</p>
          <RouterLink to="/servicios" class="portal-enlace-flecha">Explorar nuestros servicios <span aria-hidden="true">↗</span></RouterLink>
        </div>
      </section>
      <section class="portal-mas" aria-label="Más información">
        <div class="portal-seccion-titulo">
          <span class="portal-etiqueta">Más para descubrir</span>
          <h2>Conoce el centro</h2>
          <p>Información, actividades y formas de acercarte a Centro Armonía.</p>
        </div>
        <div class="portal-vitrina">
          <article class="portal-vitrina-articulo">
            <img v-if="publicacionReciente?.imagen" :src="publicacionReciente.imagen" :alt="`Imagen de ${publicacionReciente.titulo}`" loading="lazy" />
            <div v-else class="portal-vitrina-sin-imagen" aria-hidden="true">✦</div>
            <div class="portal-vitrina-cuerpo">
              <span class="portal-etiqueta">Publicaciones educativas</span>
              <small v-if="publicacionReciente?.fechaPublicacion">{{ fechaPublicacion(publicacionReciente.fechaPublicacion) }}</small>
              <h3>{{ publicacionReciente?.titulo || 'Ideas para aprender y cuidarnos' }}</h3>
              <p>{{ publicacionReciente?.descripcion || 'Explora las publicaciones que comparte el centro.' }}</p>
              <RouterLink to="/educacion" class="portal-enlace-flecha">Ver publicaciones <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </article>
          <article class="portal-vitrina-articulo">
            <img v-if="actividadReciente?.imagenes?.[0]" :src="actividadReciente.imagenes[0]" :alt="`Imagen de ${actividadReciente.titulo}`" loading="lazy" />
            <div v-else class="portal-vitrina-sin-imagen" aria-hidden="true">✦</div>
            <div class="portal-vitrina-cuerpo">
              <span class="portal-etiqueta">{{ actividadReciente ? nombreActividad(actividadReciente.tipo) : 'Capacitaciones y actividades' }}</span>
              <h3>{{ actividadReciente?.titulo || 'Actividades para crecer juntos' }}</h3>
              <p>{{ actividadReciente?.descripcion || 'Conoce las actividades y capacitaciones del centro.' }}</p>
              <RouterLink to="/corporativo" class="portal-enlace-flecha">Ver actividades <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </article>
          <article class="portal-vitrina-breve">
            <span class="portal-vitrina-breve-icono" aria-hidden="true">◷</span>
            <div>
              <span class="portal-etiqueta">Planifica tu visita</span>
              <h3>Horarios de atención</h3>
              <p>{{ horariosPublicados.length ? `${horariosPublicados.length} días con horarios publicados. Revisa los intervalos de cada día.` : 'Revisa los días y horarios de atención disponibles.' }}</p>
              <RouterLink to="/horarios" class="portal-enlace-flecha">Consultar horarios <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </article>
          <article class="portal-vitrina-breve">
            <span class="portal-vitrina-breve-icono" aria-hidden="true">✉</span>
            <div>
              <span class="portal-etiqueta">Estamos para escucharte</span>
              <h3>Contacto</h3>
              <p>{{ contenido?.contacto?.direccion || 'Escríbenos para resolver tus consultas.' }}</p>
              <RouterLink to="/contacto" class="portal-enlace-flecha">Ir a contacto <span aria-hidden="true">↗</span></RouterLink>
            </div>
          </article>
        </div>
      </section>
    </div>
  </main>
</template>
