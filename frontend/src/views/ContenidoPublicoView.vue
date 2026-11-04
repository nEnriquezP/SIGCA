<script setup>
import { onMounted, ref, watch } from 'vue'
import { solicitarApi } from '../services/api.js'

const props = defineProps({ tipo: { type: String, required: true } })
const elementos = ref([])
const cargando = ref(false)
const error = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  elementos.value = []
  try {
    const educativo = props.tipo === 'educacion'
    const datos = await solicitarApi(educativo ? '/api/publicaciones' : '/api/actividades')
    elementos.value = educativo ? datos.publicaciones : datos.actividades
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    cargando.value = false
  }
}

function tipoActividad(tipo) {
  return { CAPACITACION: 'Capacitación', ESCUELA_PADRES: 'Escuela para padres',
    OTRA: 'Otra actividad' }[tipo] || tipo
}

function fechaLegible(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return fecha
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${fecha}T12:00:00Z`))
}

onMounted(cargar)
watch(() => props.tipo, cargar)
</script>

<template>
  <main class="contenedor portal-pagina portal-editorial">
    <header class="portal-pagina-encabezado">
      <span class="portal-etiqueta">{{ tipo === 'educacion' ? 'Aprender juntos' : 'Nuestra comunidad' }}</span>
      <h1>{{ tipo === 'educacion' ? 'Contenido educativo' : 'Actividades corporativas' }}</h1>
      <p>{{ tipo === 'educacion'
        ? 'Explora artículos, ideas y recursos compartidos por el centro.'
        : 'Conoce nuestras capacitaciones, encuentros y actividades.' }}</p>
    </header>
    <p v-if="cargando" role="status">Cargando contenido…</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <button v-if="error" type="button" class="secundario" @click="cargar">Reintentar</button>
    <div v-if="!cargando && !error && !elementos.length" class="portal-estado-vacio">
      <span aria-hidden="true">✦</span><h2>Pronto habrá contenido aquí</h2>
      <p>Aún no hay contenido publicado en esta sección. Puedes conocer nuestros servicios mientras tanto.</p>
      <RouterLink to="/servicios">Conocer servicios</RouterLink>
    </div>
    <div v-if="!cargando && !error && elementos.length" class="portal-editorial-grid">
      <article v-for="(item, indice) in elementos" :key="item.id" class="portal-articulo"
        :class="{ destacado: indice === 0 }">
        <div v-if="item.imagen || item.imagenes?.[0]" class="portal-articulo-visual">
          <img :src="item.imagen || item.imagenes[0]" :alt="`Imagen de ${item.titulo}`" loading="lazy" />
        </div>
        <div v-else class="portal-articulo-visual portal-articulo-sin-imagen" aria-hidden="true">✦</div>
        <div class="portal-articulo-cuerpo">
          <div class="portal-articulo-meta">
            <span class="portal-etiqueta">{{ item.tipo ? tipoActividad(item.tipo) : 'Publicación educativa' }}</span>
            <time v-if="item.fechaPublicacion" :datetime="item.fechaPublicacion">{{ fechaLegible(item.fechaPublicacion) }}</time>
          </div>
          <h2>{{ item.titulo }}</h2>
          <p class="texto-preservado">{{ item.descripcion }}</p>
          <div v-if="item.imagenes?.length > 1" class="portal-articulo-galeria" :aria-label="`Más imágenes de ${item.titulo}`">
            <img v-for="(imagen, posicion) in item.imagenes.slice(1)" :key="`${item.id}-${posicion}`"
              :src="imagen" :alt="`Imagen ${posicion + 2} de ${item.titulo}`" loading="lazy" />
          </div>
          <a v-if="item.enlace" class="portal-enlace-flecha" :href="item.enlace" rel="noopener noreferrer" target="_blank">Abrir enlace relacionado <span aria-hidden="true">↗</span></a>
        </div>
      </article>
    </div>
  </main>
</template>
