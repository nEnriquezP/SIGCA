<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { solicitarApi } from '../services/api.js'

const route = useRoute()
const servicios = ref([])
const formulario = ref(vacio())
const cargando = ref(true)
const enviando = ref(false)
const error = ref('')
const confirmacion = ref(null)

function vacio() {
  return { nombreSolicitante: '', correo: '', telefono: '', servicio: '',
    fechaPreferida: '', mensajeAdicional: '' }
}

function hoyGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const v = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${v.year}-${v.month}-${v.day}`
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    servicios.value = (await solicitarApi('/api/servicios')).servicios
    const sugerido = typeof route.query.servicio === 'string' ? route.query.servicio : ''
    formulario.value.servicio = servicios.value.some((s) => s.id === sugerido) ? sugerido : ''
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    cargando.value = false
  }
}

async function enviar() {
  error.value = ''
  confirmacion.value = null
  const datos = Object.fromEntries(Object.entries(formulario.value).map(([clave, valor]) =>
    [clave, valor.trim()]))
  if (!datos.nombreSolicitante || datos.nombreSolicitante.length > 120 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo) || datos.correo.length > 254 ||
      !/^[+\d][\d\s()+.-]{6,29}$/.test(datos.telefono) ||
      !servicios.value.some((s) => s.id === datos.servicio) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaPreferida) ||
      datos.fechaPreferida < hoyGuatemala() || datos.mensajeAdicional.length > 2000) {
    error.value = 'Revisa contacto, servicio activo y fecha preferida de hoy o posterior.'
    return
  }
  enviando.value = true
  try {
    const respuesta = await solicitarApi('/api/solicitudes-cita', { method: 'POST', body: datos })
    confirmacion.value = respuesta
    formulario.value = vacio()
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    enviando.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <main class="contenedor estrecho">
    <h1>Solicitar cita</h1>
    <p>Indica una <strong>fecha preferida</strong>. Enviar este formulario no confirma una cita ni reserva horario. El centro revisará tu solicitud.</p>
    <p v-if="cargando" role="status">Cargando servicios activos…</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <button v-if="error && !servicios.length" type="button" class="secundario" @click="cargar">Reintentar</button>
    <section v-if="confirmacion" class="tarjeta" role="status">
      <h2>Solicitud recibida</h2>
      <p>{{ confirmacion.mensaje }}</p>
      <p>Identificador para consulta con el centro: {{ confirmacion.solicitud.id }}</p>
      <p>Estado: {{ confirmacion.solicitud.estado }}</p>
    </section>
    <section v-if="!cargando" class="tarjeta">
      <p v-if="!servicios.length">No hay servicios activos disponibles para solicitar.</p>
      <form v-else @submit.prevent="enviar">
        <label>Nombre del solicitante<input v-model="formulario.nombreSolicitante" required maxlength="120" autocomplete="name" /></label>
        <label>Correo electrónico<input v-model="formulario.correo" type="email" required maxlength="254" autocomplete="email" /></label>
        <label>Teléfono<input v-model="formulario.telefono" type="tel" required maxlength="30" pattern="[+0-9][0-9 ()+.-]{6,29}" autocomplete="tel" /></label>
        <label>Servicio solicitado<select v-model="formulario.servicio" required>
          <option disabled value="">Selecciona un servicio activo</option>
          <option v-for="servicio in servicios" :key="servicio.id" :value="servicio.id">{{ servicio.nombre }}</option>
        </select></label>
        <label>Fecha preferida<input v-model="formulario.fechaPreferida" type="date" :min="hoyGuatemala()" required /></label>
        <label>Mensaje adicional (opcional)<textarea v-model="formulario.mensajeAdicional" maxlength="2000" /></label>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Enviar solicitud' }}</button>
      </form>
    </section>
  </main>
</template>
