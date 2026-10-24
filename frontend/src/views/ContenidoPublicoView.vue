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

onMounted(cargar)
watch(() => props.tipo, cargar)
</script>

<template>
  <main class="contenedor">
    <h1>{{ tipo === 'educacion' ? 'Contenido educativo' : 'Actividades corporativas' }}</h1>
    <p v-if="cargando" role="status">Cargando contenido…</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <button v-if="error" type="button" class="secundario" @click="cargar">Reintentar</button>
    <p v-if="!cargando && !error && !elementos.length">Aún no hay contenido publicado en esta sección.</p>
    <div v-if="!cargando && !error" class="portal-grid">
      <article v-for="item in elementos" :key="item.id" class="tarjeta">
        <img v-if="item.imagen" class="portal-imagen" :src="item.imagen" :alt="`Imagen de ${item.titulo}`" />
        <div v-if="item.imagenes?.length" class="portal-grid">
          <img v-for="(imagen, indice) in item.imagenes" :key="`${item.id}-${indice}`"
            class="portal-imagen" :src="imagen" :alt="`Imagen ${indice + 1} de ${item.titulo}`" />
        </div>
        <p v-if="item.tipo">{{ tipoActividad(item.tipo) }}</p>
        <p v-if="item.fechaPublicacion">Publicado: {{ item.fechaPublicacion }}</p>
        <h2>{{ item.titulo }}</h2>
        <p class="texto-preservado">{{ item.descripcion }}</p>
        <a v-if="item.enlace" :href="item.enlace" rel="noopener noreferrer" target="_blank">Abrir enlace relacionado</a>
      </article>
    </div>
  </main>
</template>
