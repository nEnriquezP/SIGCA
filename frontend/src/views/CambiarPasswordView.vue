<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const passwordActual = ref('')
const passwordNueva = ref('')
const error = ref('')
const enviando = ref(false)
const verPasswordActual = ref(false)
const verPasswordNueva = ref(false)
const patronPassword = '(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[@#$_])[A-Za-z0-9@#$_]{8,30}'
const requisitos = computed(() => [
  { texto: 'Entre 8 y 30 caracteres', cumplido: passwordNueva.value.length >= 8 && passwordNueva.value.length <= 30 },
  { texto: 'Al menos una letra mayúscula', cumplido: /[A-Z]/.test(passwordNueva.value) },
  { texto: 'Al menos una letra minúscula', cumplido: /[a-z]/.test(passwordNueva.value) },
  { texto: 'Al menos un número', cumplido: /\d/.test(passwordNueva.value) },
  { texto: 'Al menos un símbolo: @ # $ _', cumplido: /[@#$_]/.test(passwordNueva.value) },
  { texto: 'Sin espacios ni otros símbolos', cumplido: passwordNueva.value.length > 0 && /^[A-Za-z0-9@#$_]+$/.test(passwordNueva.value) },
])

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
        <div class="campo-password">
          <label for="password-actual">Contraseña actual <span class="requisito-campo">Obligatorio</span></label>
          <div class="password-control">
            <input id="password-actual" v-model="passwordActual" :type="verPasswordActual ? 'text' : 'password'"
              required autocomplete="current-password" />
            <button type="button" class="password-visibilidad"
              :aria-label="verPasswordActual ? 'Ocultar contraseña actual' : 'Ver contraseña actual'"
              :aria-pressed="verPasswordActual" @click="verPasswordActual = !verPasswordActual">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="verPasswordActual" d="M3 3l18 18" />
              </svg>
              {{ verPasswordActual ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
          <small>Es la contraseña inicial con la que ingresaste, o tu contraseña vigente si ya la cambiaste.</small>
        </div>
        <div class="campo-password">
          <label for="password-nueva">Nueva contraseña <span class="requisito-campo">Obligatorio</span></label>
          <div class="password-control">
            <input id="password-nueva" v-model="passwordNueva" :type="verPasswordNueva ? 'text' : 'password'"
              required minlength="8" maxlength="30" :pattern="patronPassword" autocomplete="new-password"
              aria-describedby="requisitos-mi-password" />
            <button type="button" class="password-visibilidad"
              :aria-label="verPasswordNueva ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'"
              :aria-pressed="verPasswordNueva" @click="verPasswordNueva = !verPasswordNueva">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="verPasswordNueva" d="M3 3l18 18" />
              </svg>
              {{ verPasswordNueva ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
          <ul id="requisitos-mi-password" class="lista-requisitos-password" aria-label="Requisitos de la nueva contraseña" aria-live="polite">
            <li v-for="requisito in requisitos" :key="requisito.texto" :class="{ cumplido: requisito.cumplido }">
              <span aria-hidden="true">{{ requisito.cumplido ? '✓' : '○' }}</span>{{ requisito.texto }}
            </li>
          </ul>
        </div>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Guardando…' : 'Cambiar contraseña' }}</button>
      </form>
    </section>
  </main>
</template>
