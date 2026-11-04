<script setup>
import avatarAutor from '../assets/avatar-autor.png'

defineProps({
  nombre: { type: String, required: true },
  subtitulo: { type: String, default: '' },
})
</script>

<template>
  <footer class="pie-pagina">
    <div class="pie-contenido">
      <div class="pie-institucion">
        <strong>{{ nombre }}</strong>
        <span v-if="subtitulo">{{ subtitulo }}</span>
        <small>© 2026 {{ nombre }}. Todos los derechos reservados.</small>
      </div>
      <div class="pie-autoria">
        <img :src="avatarAutor" alt="Avatar ilustrado de Nelson Fernando Enríquez Portillo" width="66" height="66" loading="lazy" decoding="async" />
        <p><span>Autor del sitio</span><strong>Nelson Fernando Enríquez Portillo</strong></p>
      </div>
    </div>
  </footer>
</template>
