<script setup>
import { onMounted, ref } from 'vue'
import { solicitarApi } from '../services/api.js'

const contenido = ref(null)
const indice = ref(0)
const cargando = ref(true)
const error = ref('')

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    contenido.value = (await solicitarApi('/api/contenido')).contenido
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    cargando.value = false
  }
}

function mover(pasos) {
  const total = contenido.value?.carrusel?.length || 0
  if (total) indice.value = (indice.value + pasos + total) % total
}

onMounted(cargar)
</script>

<template>
  <main>
    <section class="portal-hero">
      <h1>{{ contenido?.nombreCentro || 'SIGCA' }}</h1>
      <p v-if="contenido" class="texto-preservado">{{ contenido.informacionPrincipal }}</p>
      <p v-else-if="!cargando && !error">La información del centro aún no está publicada.</p>
      <p v-if="cargando" role="status">Cargando información del centro…</p>
      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      <button v-if="error" type="button" class="secundario" @click="cargar">Reintentar</button>
    </section>
    <div class="contenedor">
      <section v-if="contenido?.carrusel?.length" class="carrusel" aria-label="Imágenes del centro">
        <img :src="contenido.carrusel[indice]" :alt="`Imagen ${indice + 1} de ${contenido.carrusel.length} del centro`" />
        <div class="carrusel-controles">
          <button type="button" class="secundario" aria-label="Imagen anterior" @click="mover(-1)">Anterior</button>
          <span>{{ indice + 1 }} de {{ contenido.carrusel.length }}</span>
          <button type="button" class="secundario" aria-label="Imagen siguiente" @click="mover(1)">Siguiente</button>
        </div>
      </section>
      <section v-if="contenido" class="portal-grid" aria-label="Identidad institucional">
        <article class="tarjeta"><h2>Misión</h2><p class="texto-preservado">{{ contenido.mision }}</p></article>
        <article class="tarjeta"><h2>Visión</h2><p class="texto-preservado">{{ contenido.vision }}</p></article>
      </section>
      <section aria-label="Secciones principales">
        <h2>Conoce el centro</h2>
        <div class="portal-grid">
          <article class="tarjeta"><h3>Servicios</h3><p>Conoce las atenciones disponibles.</p><RouterLink to="/servicios">Ver servicios</RouterLink></article>
          <article class="tarjeta"><h3>Educación</h3><p>Lee nuestras publicaciones informativas.</p><RouterLink to="/educacion">Ver publicaciones</RouterLink></article>
          <article class="tarjeta"><h3>Corporativo</h3><p>Consulta capacitaciones y actividades.</p><RouterLink to="/corporativo">Ver actividades</RouterLink></article>
          <article class="tarjeta"><h3>Horarios</h3><p>Revisa los días y horas de atención.</p><RouterLink to="/horarios">Ver horarios</RouterLink></article>
          <article class="tarjeta"><h3>Contacto</h3><p>Envíanos un mensaje.</p><RouterLink to="/contacto">Ir a contacto</RouterLink></article>
        </div>
      </section>
    </div>
  </main>
</template>
