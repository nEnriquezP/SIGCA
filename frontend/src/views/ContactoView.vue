<script setup>
import { onMounted, ref } from 'vue'
import { solicitarApi } from '../services/api.js'
import { mostrarError } from '../services/avisos.js'

const contenido = ref(null)
const cargando = ref(true)
const enviando = ref(false)
const errorContenido = ref('')
const error = ref('')
const aviso = ref('')
const formulario = ref(vacio())

function vacio() {
  return { nombre: '', correo: '', telefono: '', asunto: '', mensaje: '' }
}

async function cargar() {
  cargando.value = true
  errorContenido.value = ''
  try {
    contenido.value = (await solicitarApi('/api/contenido')).contenido
  } catch (fallo) {
    errorContenido.value = fallo.message
  } finally {
    cargando.value = false
  }
}

async function enviar() {
  error.value = ''
  aviso.value = ''
  const datos = Object.fromEntries(Object.entries(formulario.value).map(([clave, valor]) =>
    [clave, valor.trim()]))
  if (!datos.nombre || datos.nombre.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo) || datos.correo.length > 254 ||
      !/^[+\d][\d\s()+.-]{6,29}$/.test(datos.telefono) ||
      !datos.asunto || datos.asunto.length > 160 ||
      !datos.mensaje || datos.mensaje.length > 4000) {
    error.value = 'Revisa nombre, correo, teléfono, asunto y mensaje'
    mostrarError(error.value)
    return
  }
  enviando.value = true
  try {
    await solicitarApi('/api/mensajes-contacto', { method: 'POST', body: datos })
    formulario.value = vacio()
    aviso.value = 'Mensaje recibido. Gracias por contactarnos.'
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    enviando.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <main class="contenedor">
    <h1>Contacto</h1>
    <p v-if="cargando" role="status">Cargando información de contacto…</p>
    <p v-if="errorContenido" class="mensaje-error" role="alert">{{ errorContenido }}</p>
    <button v-if="errorContenido" type="button" class="secundario" @click="cargar">Reintentar</button>
    <section v-if="contenido?.contacto" class="tarjeta">
      <h2>Información del centro</h2>
      <p>Correo: {{ contenido.contacto.correo }}</p>
      <p>Teléfono: {{ contenido.contacto.telefono }}</p>
      <p>Dirección: {{ contenido.contacto.direccion }}</p>
    </section>
    <p v-else-if="!cargando && !errorContenido">La información de contacto aún no está publicada.</p>
    <section class="tarjeta">
      <h2>Envíanos un mensaje</h2>
      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>
      <form class="formulario-grid" @submit.prevent="enviar">
        <label>Nombre <span class="requisito-campo">Obligatorio</span><input v-model="formulario.nombre" required maxlength="120" autocomplete="name" /></label>
        <label>Correo electrónico <span class="requisito-campo">Obligatorio</span><input v-model="formulario.correo" type="email" required maxlength="254" autocomplete="email" /></label>
        <label>Teléfono <span class="requisito-campo">Obligatorio</span><input v-model="formulario.telefono" type="tel" required maxlength="30" autocomplete="tel" pattern="[+0-9][0-9 ()+.-]{6,29}" /></label>
        <label>Asunto <span class="requisito-campo">Obligatorio</span><input v-model="formulario.asunto" required maxlength="160" /></label>
        <label>Mensaje <span class="requisito-campo">Obligatorio</span><textarea v-model="formulario.mensaje" required maxlength="4000" /></label>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Enviar mensaje' }}</button>
      </form>
    </section>
  </main>
</template>
