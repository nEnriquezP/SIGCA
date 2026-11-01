<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useSesionStore } from '../stores/sesion.js'
import { mostrarError } from '../services/avisos.js'

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
    const destino = sesion.tienePermiso('PORTAL_GESTIONAR') ? '/administracion-portal'
      : sesion.tienePermiso('SOLICITUDES_VER') ? '/gestion-solicitudes'
        : sesion.tienePermiso('PACIENTES_VER') ? '/pacientes'
          : sesion.tienePermiso('RESPONSABLES_VER') ? '/responsables'
            : sesion.tienePermiso('SERVICIOS_VER') ? '/gestion-servicios'
              : sesion.tienePermiso('HORARIOS_VER') ? '/gestion-horarios' : '/mi-password'
    await router.push(destino)
  } catch (error) {
    mensaje.value = error.message || 'No se pudo iniciar sesión'
    mostrarError(mensaje.value)
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <main class="contenedor estrecho">
    <section class="tarjeta">
      <h1>Ingresar a SIGCA</h1>
      <p v-if="$route.query.password === 'actualizada'" class="mensaje-exito" role="status">Contraseña actualizada. Inicia sesión de nuevo.</p>
      <p>Accede con el correo y la contraseña asignados por el administrador.</p>
      <form @submit.prevent="ingresar">
        <label for="correo">Correo electrónico <span class="requisito-campo">Obligatorio</span></label>
        <input id="correo" v-model.trim="correo" type="email" autocomplete="username" required />
        <label for="password">Contraseña <span class="requisito-campo">Obligatorio</span></label>
        <input id="password" v-model="password" type="password" autocomplete="current-password" required />
        <p v-if="mensaje" class="mensaje-error" role="alert">{{ mensaje }}</p>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Ingresando…' : 'Ingresar' }}</button>
      </form>
    </section>
  </main>
</template>
