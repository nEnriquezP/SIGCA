<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { avisoEspera, diasHasta, fechaMaximaGuatemala, hoyGuatemala } from '../utils/fechasCita.js'
import { mostrarError } from '../services/avisos.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'

const route = useRoute()
const servicios = ref([])
const formulario = ref(vacio())
const cargando = ref(true)
const enviando = ref(false)
const error = ref('')
const confirmacion = ref(null)
const avisoOpciones = ref('')

function vacio() {
  return { nombreSolicitante: '', correo: '', telefono: '', servicio: '',
    fechaPreferida: '', mensajeAdicional: '' }
}

async function cargar(inicial = false) {
  if (inicial) cargando.value = true
  error.value = ''
  try {
    servicios.value = (await solicitarApi('/api/servicios/opciones', { silencioso: !inicial })).servicios
    const sugerido = typeof route.query.servicio === 'string' ? route.query.servicio : ''
    if (inicial) formulario.value.servicio = servicios.value.some((s) => s.id === sugerido) ? sugerido : ''
    else if (formulario.value.servicio && !servicios.value.some((s) => s.id === formulario.value.servicio)) {
      formulario.value.servicio = ''
      avisoOpciones.value = 'El servicio seleccionado ya no está activo. Elige otro.'
    }
  } catch (fallo) {
    if (inicial) error.value = fallo.message
  } finally {
    if (inicial) cargando.value = false
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
      diasHasta(datos.fechaPreferida) === null || diasHasta(datos.fechaPreferida) < 0 ||
      diasHasta(datos.fechaPreferida) > 365 || datos.mensajeAdicional.length > 2000) {
    error.value = 'Revisa el contacto, el servicio activo y la fecha preferida entre hoy y los próximos 365 días.'
    mostrarError(error.value, 'fechaPreferida')
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

onMounted(() => cargar(true))
useOpcionesVivas(() => cargar(false), ['servicios'])
</script>

<template>
  <main class="contenedor estrecho">
    <h1>Solicitar cita</h1>
    <p>Indica una <strong>fecha preferida</strong>. Enviar este formulario no confirma una cita ni reserva horario. El centro revisará tu solicitud.</p>
    <p v-if="cargando" role="status">Cargando servicios activos…</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="avisoOpciones" class="mensaje-error" role="status">{{ avisoOpciones }}</p>
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
        <label>Nombre del solicitante <span class="requisito-campo">Obligatorio</span><input v-model="formulario.nombreSolicitante" required maxlength="120" autocomplete="name" /></label>
        <label>Correo electrónico <span class="requisito-campo">Obligatorio</span><input v-model="formulario.correo" type="email" required maxlength="254" autocomplete="email" /></label>
        <label>Teléfono <span class="requisito-campo">Obligatorio</span><input v-model="formulario.telefono" type="tel" required maxlength="30" pattern="[+0-9][0-9 ()+.-]{6,29}" autocomplete="tel" /></label>
        <label>Servicio solicitado <span class="requisito-campo">Obligatorio</span><select v-model="formulario.servicio" data-campo="servicio" required>
          <option disabled value="">Selecciona un servicio activo</option>
          <option v-for="servicio in servicios" :key="servicio.id" :value="servicio.id">{{ servicio.nombre }}</option>
        </select></label>
        <label>Fecha preferida <span class="requisito-campo">Obligatorio</span>
          <input v-model="formulario.fechaPreferida" data-campo="fechaPreferida" type="date"
            :min="hoyGuatemala()" :max="fechaMaximaGuatemala()" required />
          <small v-if="formulario.fechaPreferida" role="status">{{ avisoEspera(formulario.fechaPreferida) }}</small></label>
        <label>Mensaje adicional <span class="requisito-campo">Opcional</span><textarea v-model="formulario.mensajeAdicional" maxlength="2000" /></label>
        <button type="submit" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Enviar solicitud' }}</button>
      </form>
    </section>
  </main>
</template>
