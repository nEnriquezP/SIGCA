<script setup>
import { onMounted, ref } from 'vue'
import { solicitarApi } from '../services/api.js'

const estado = ref('Verificando enlace…')
const error = ref('')

onMounted(async () => {
  const token = new URLSearchParams(location.hash.slice(1)).get('token')
  history.replaceState(null, '', location.pathname)
  if (!token) { estado.value = ''; error.value = 'Falta el enlace de verificación.'; return }
  try {
    const respuesta = await solicitarApi('/api/correo/verificar', { method: 'POST', body: { token } })
    estado.value = respuesta.mensaje
  } catch (fallo) {
    estado.value = ''
    error.value = fallo.message || 'No se pudo verificar el correo.'
  }
})

</script>

<template>
  <main class="contenedor estrecho">
    <section class="tarjeta">
      <h1>Verificar correo</h1>
      <p v-if="estado" class="mensaje-exito" role="status">{{ estado }}</p>
      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      <p v-if="error">Si necesitas otro enlace, solicítalo al administrador del sistema.</p>
      <p v-if="estado && estado !== 'Verificando enlace…'"><RouterLink to="/ingresar">Ir a iniciar sesión</RouterLink></p>
    </section>
  </main>
</template>
