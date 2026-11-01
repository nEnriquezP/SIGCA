<script setup>
import { ref } from 'vue'
import { solicitarApi } from '../services/api.js'
const correo = ref('')
const mensaje = ref('')
const error = ref('')
const enviando = ref(false)
async function enviar() {
  enviando.value = true
  error.value = ''
  try {
    const resultado = await solicitarApi('/api/auth/recuperar', {
      method: 'POST', body: { correo: correo.value },
    })
    mensaje.value = resultado.mensaje
  } catch (fallo) { error.value = fallo.message || 'No se pudo solicitar el enlace.' }
  finally { enviando.value = false }
}
</script>

<template>
  <main class="contenedor estrecho"><section class="tarjeta">
    <h1>Recuperar contraseña</h1>
    <p>Enviaremos un enlace de un solo uso al correo verificado de tu cuenta. Vence en una hora.</p>
    <p v-if="mensaje" class="mensaje-exito" role="status">{{ mensaje }}</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <form @submit.prevent="enviar">
      <label>Correo electrónico <input v-model.trim="correo" type="email" required maxlength="254" autocomplete="email" /></label>
      <button :disabled="enviando">{{ enviando ? 'Enviando…' : 'Solicitar enlace' }}</button>
    </form>
    <p><RouterLink to="/ingresar">Volver a ingresar</RouterLink></p>
  </section></main>
</template>
