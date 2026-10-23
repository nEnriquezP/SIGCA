<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const correo = ref('')
const password = ref('')
const mensaje = ref('')
const enviando = ref(false)

async function ingresar() {
  mensaje.value = ''
  enviando.value = true
  try {
    await sesion.iniciar(correo.value, password.value)
    password.value = ''
    await router.push(sesion.usuario.rol === 'ADMINISTRADOR' ? '/usuarios' : '/')
  } catch (error) {
    mensaje.value = error.message || 'No se pudo iniciar sesión'
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <main class="contenedor estrecho">
    <section class="tarjeta">
      <h1>Ingresar a SIGCA</h1>
      <p>Accede con el correo y la contraseña asignados por el administrador.</p>
      <form @submit.prevent="ingresar">
        <label for="correo">Correo electrónico</label>
        <input id="correo" v-model.trim="correo" type="email" autocomplete="username" required />
        <label for="password">Contraseña</label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />
        <p v-if="mensaje" class="mensaje-error" role="alert">{{ mensaje }}</p>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Ingresando…' : 'Ingresar' }}</button>
      </form>
    </section>
  </main>
</template>
