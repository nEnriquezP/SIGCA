<script setup>
import { onMounted, ref } from 'vue'
import { solicitarApi } from '../services/api.js'

const estado = ref('Verificando enlace…')
const error = ref('')
const correo = ref('')
const tipo = ref('USUARIO')
const enviando = ref(false)

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

async function reenviar() {
  enviando.value = true
  error.value = ''
  try {
    const respuesta = await solicitarApi('/api/correo/reenviar', {
      method: 'POST', body: { tipo: tipo.value, correo: correo.value },
    })
    estado.value = respuesta.mensaje
  } catch (fallo) {
    error.value = fallo.message || 'No se pudo solicitar el enlace.'
  } finally { enviando.value = false }
}
</script>

<template>
  <main class="contenedor estrecho">
    <section class="tarjeta">
      <h1>Verificar correo</h1>
      <p v-if="estado" class="mensaje-exito" role="status">{{ estado }}</p>
      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      <p>El enlace vence en 6 horas y solo se puede usar una vez.</p>
      <h2>Solicitar otro enlace</h2>
      <form @submit.prevent="reenviar">
        <label>Tipo de registro <select v-model="tipo">
          <option value="USUARIO">Usuario del sistema</option>
          <option value="PACIENTE">Paciente</option>
          <option value="RESPONSABLE">Responsable</option>
        </select></label>
        <label>Correo electrónico <input v-model.trim="correo" type="email" required maxlength="254" /></label>
        <button :disabled="enviando">{{ enviando ? 'Enviando…' : 'Reenviar enlace' }}</button>
      </form>
      <p><RouterLink to="/ingresar">Ir a iniciar sesión</RouterLink></p>
    </section>
  </main>
</template>
