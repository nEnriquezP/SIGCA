<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const passwordActual = ref('')
const passwordNueva = ref('')
const error = ref('')
const enviando = ref(false)

async function cambiar() {
  error.value = ''
  enviando.value = true
  try {
    await solicitarApi('/api/auth/password', {
      method: 'PUT', token: sesion.token,
      body: { passwordActual: passwordActual.value, passwordNueva: passwordNueva.value },
    })
    passwordActual.value = ''
    passwordNueva.value = ''
    sesion.cerrar()
    await router.push({ name: 'ingresar', query: { password: 'actualizada' } })
  } catch (fallo) {
    if (fallo.status === 401) {
      sesion.cerrar()
      await router.push({ name: 'ingresar' })
    }
    error.value = fallo.message || 'No se pudo cambiar la contraseña'
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <main class="contenedor estrecho">
    <section class="tarjeta">
      <h1>Cambiar mi contraseña</h1>
      <p>Después del cambio tendrás que iniciar sesión de nuevo.</p>
      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      <form @submit.prevent="cambiar">
        <label>Contraseña actual
          <input v-model="passwordActual" type="password" required autocomplete="current-password" />
        </label>
        <label>Nueva contraseña, al menos 12 caracteres
          <input v-model="passwordNueva" type="password" required minlength="12" autocomplete="new-password" />
        </label>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Guardando…' : 'Cambiar contraseña' }}</button>
      </form>
    </section>
  </main>
</template>
