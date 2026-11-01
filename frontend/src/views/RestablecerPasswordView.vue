<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
const router = useRouter()
const token = ref('')
const password = ref('')
const ver = ref(false)
const error = ref('')
const enviando = ref(false)
const requisitos = computed(() => [
  ['Entre 8 y 30 caracteres', password.value.length >= 8 && password.value.length <= 30],
  ['Una mayúscula', /[A-Z]/.test(password.value)],
  ['Una minúscula', /[a-z]/.test(password.value)],
  ['Un número', /\d/.test(password.value)],
  ['Un símbolo: @ # $ _', /[@#$_]/.test(password.value)],
  ['Sin espacios ni otros símbolos', /^[A-Za-z0-9@#$_]+$/.test(password.value) && Boolean(password.value)],
])
onMounted(() => {
  token.value = new URLSearchParams(location.hash.slice(1)).get('token') || ''
  history.replaceState(null, '', location.pathname)
})
async function restablecer() {
  if (!token.value) { error.value = 'El enlace no es válido.'; return }
  enviando.value = true
  error.value = ''
  try {
    await solicitarApi('/api/auth/restablecer', {
      method: 'POST', body: { token: token.value, passwordNueva: password.value },
    })
    await router.replace({ name: 'ingresar', query: { password: 'actualizada' } })
  } catch (fallo) { error.value = fallo.message || 'No se pudo restablecer la contraseña.' }
  finally { enviando.value = false }
}
</script>

<template>
  <main class="contenedor estrecho"><section class="tarjeta">
    <h1>Restablecer contraseña</h1>
    <p>Este enlace vence en una hora y solo se puede usar una vez.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <form @submit.prevent="restablecer">
      <label>Nueva contraseña <span class="requisito-campo">Obligatorio</span></label>
      <div class="password-control">
        <input v-model="password" :type="ver ? 'text' : 'password'" required minlength="8" maxlength="30"
          autocomplete="new-password" />
        <button type="button" class="password-visibilidad" @click="ver = !ver">{{ ver ? 'Ocultar' : 'Ver' }}</button>
      </div>
      <ul class="lista-requisitos-password" aria-live="polite">
        <li v-for="[texto, valido] in requisitos" :key="texto" :class="{ cumplido: valido }">{{ valido ? '✓' : '○' }} {{ texto }}</li>
      </ul>
      <button :disabled="enviando || !requisitos.every(([, valido]) => valido)">{{ enviando ? 'Guardando…' : 'Guardar contraseña' }}</button>
    </form>
  </section></main>
</template>
