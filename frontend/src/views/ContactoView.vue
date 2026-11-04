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
  <main class="contenedor portal-pagina portal-contacto">
    <header class="portal-pagina-encabezado">
      <span class="portal-etiqueta">Hablemos</span>
      <h1>Estamos aquí para escucharte</h1>
      <p>Si tienes alguna consulta, escríbenos. Completa el formulario y el centro recibirá tu mensaje.</p>
    </header>
    <p v-if="cargando" role="status">Cargando información de contacto…</p>
    <p v-if="errorContenido" class="mensaje-error" role="alert">{{ errorContenido }}</p>
    <button v-if="errorContenido" type="button" class="secundario" @click="cargar">Reintentar</button>
    <div class="portal-contacto-layout">
      <section class="portal-contacto-datos">
        <span class="portal-etiqueta">Centro Armonía</span>
        <h2>Conversemos</h2>
        <p>Elige la forma de contacto que prefieras o déjanos un mensaje desde esta página.</p>
        <div v-if="contenido?.contacto" class="portal-contacto-lista">
          <div class="portal-contacto-dato">
            <span class="portal-contacto-icono" aria-hidden="true">✉</span>
            <div><strong>Correo electrónico</strong><a :href="`mailto:${contenido.contacto.correo}`">{{ contenido.contacto.correo }}</a></div>
          </div>
          <div class="portal-contacto-dato">
            <span class="portal-contacto-icono" aria-hidden="true">☎</span>
            <div><strong>Teléfono</strong><a :href="`tel:${contenido.contacto.telefono.replace(/\s/g, '')}`">{{ contenido.contacto.telefono }}</a></div>
          </div>
          <div class="portal-contacto-dato">
            <span class="portal-contacto-icono" aria-hidden="true">⌖</span>
            <div><strong>Dirección</strong><span>{{ contenido.contacto.direccion }}</span></div>
          </div>
        </div>
        <p v-else-if="!cargando && !errorContenido">La información de contacto aún no está publicada.</p>
        <RouterLink class="portal-contacto-cita" to="/solicitar-cita">¿Necesitas una cita? Solicítala aquí <span aria-hidden="true">↗</span></RouterLink>
      </section>
      <section class="portal-contacto-formulario">
        <span class="portal-etiqueta">Escríbenos</span>
        <h2>Envíanos un mensaje</h2>
        <p>Los campos marcados como obligatorios nos ayudan a responderte.</p>
        <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
        <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>
        <form class="formulario-grid" @submit.prevent="enviar">
          <label>Nombre <span class="requisito-campo">Obligatorio</span><input v-model="formulario.nombre" required maxlength="120" autocomplete="name" placeholder="Tu nombre completo" /></label>
          <label>Correo electrónico <span class="requisito-campo">Obligatorio</span><input v-model="formulario.correo" type="email" required maxlength="254" autocomplete="email" placeholder="nombre@dominio.com" /></label>
          <label>Teléfono <span class="requisito-campo">Obligatorio</span><input v-model="formulario.telefono" type="tel" required maxlength="30" autocomplete="tel" pattern="[+0-9][0-9 ()+.-]{6,29}" placeholder="Tu número de contacto" /></label>
          <label>Asunto <span class="requisito-campo">Obligatorio</span><input v-model="formulario.asunto" required maxlength="160" placeholder="¿Sobre qué deseas consultarnos?" /></label>
          <label class="portal-form-ancho">Mensaje <span class="requisito-campo">Obligatorio</span><textarea v-model="formulario.mensaje" required maxlength="4000" placeholder="Cuéntanos cómo podemos ayudarte" /></label>
          <div class="portal-form-acciones"><button type="submit" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Enviar mensaje' }} <span aria-hidden="true">↗</span></button></div>
        </form>
      </section>
    </div>
  </main>
</template>
