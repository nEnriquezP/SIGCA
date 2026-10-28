<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const solicitudes = ref([])
const servicios = ref([])
const pacientes = ref([])
const profesionales = ref([])
const detalle = ref(null)
const filtro = ref({ estado: '', buscar: '' })
const buscarPaciente = ref('')
const conversion = ref({ paciente: '', profesional: '', fecha: '', horaInicio: '' })
const cargando = ref(true)
const cargandoDetalle = ref(false)
const operando = ref(false)
const error = ref('')
const aviso = ref('')

function fallo(f) {
  if (f.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = f.message || 'No se pudo completar la operación'
}

function nombreServicio(id) {
  return servicios.value.find((s) => s.id === id)?.nombre || id
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const query = new URLSearchParams()
    if (filtro.value.estado) query.set('estado', filtro.value.estado)
    if (filtro.value.buscar.trim()) query.set('buscar', filtro.value.buscar.trim())
    const [datos, datosServicios] = await Promise.all([
      solicitarApi(`/api/solicitudes-cita${query.size ? `?${query}` : ''}`, { token: sesion.token }),
      solicitarApi('/api/servicios/administracion', { token: sesion.token }),
    ])
    solicitudes.value = datos.solicitudes
    servicios.value = datosServicios.servicios
  } catch (f) {
    fallo(f)
  } finally {
    cargando.value = false
  }
}

async function ver(item) {
  cargandoDetalle.value = true
  error.value = ''
  aviso.value = ''
  try {
    const [datos, opciones] = await Promise.all([
      solicitarApi(`/api/solicitudes-cita/${item.id}`, { token: sesion.token }),
      solicitarApi('/api/solicitudes-cita/opciones', { token: sesion.token }),
    ])
    detalle.value = datos.solicitud
    pacientes.value = opciones.pacientes
    profesionales.value = opciones.profesionales
    conversion.value = { paciente: '', profesional: '',
      fecha: datos.solicitud.fechaPreferida, horaInicio: '' }
  } catch (f) {
    fallo(f)
  } finally {
    cargandoDetalle.value = false
  }
}

async function buscarPacientes() {
  error.value = ''
  try {
    const query = buscarPaciente.value.trim() ?
      `?buscarPaciente=${encodeURIComponent(buscarPaciente.value.trim())}` : ''
    const datos = await solicitarApi(`/api/solicitudes-cita/opciones${query}`,
      { token: sesion.token })
    const actual = pacientes.value.find((p) => p.id === conversion.value.paciente)
    pacientes.value = actual && !datos.pacientes.some((p) => p.id === actual.id) ?
      [actual, ...datos.pacientes] : datos.pacientes
    profesionales.value = datos.profesionales
  } catch (f) {
    fallo(f)
  }
}

async function rechazar() {
  if (!detalle.value || !window.confirm('¿Confirmas rechazar esta solicitud? El registro se conservará.')) return
  operando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const datos = await solicitarApi(`/api/solicitudes-cita/${detalle.value.id}/rechazar`, {
      method: 'PATCH', token: sesion.token, body: {},
    })
    detalle.value = datos.solicitud
    aviso.value = 'Solicitud rechazada'
    await cargar()
  } catch (f) {
    fallo(f)
  } finally {
    operando.value = false
  }
}

async function convertir() {
  if (!detalle.value) return
  error.value = ''
  aviso.value = ''
  if (!conversion.value.paciente || !conversion.value.profesional ||
      !conversion.value.fecha || !/^([01]\d|2[0-3]):[0-5]\d$/.test(conversion.value.horaInicio)) {
    error.value = 'Selecciona paciente, profesional, fecha y hora de inicio.'
    return
  }
  if (!window.confirm('¿Crear una cita PENDIENTE para este paciente y marcar la solicitud como ATENDIDA?')) return
  operando.value = true
  try {
    const datos = await solicitarApi(`/api/solicitudes-cita/${detalle.value.id}/convertir`, {
      method: 'POST', token: sesion.token, body: conversion.value,
    })
    detalle.value = (await solicitarApi(`/api/solicitudes-cita/${datos.solicitud.id}`,
      { token: sesion.token })).solicitud
    aviso.value = `${datos.mensaje} Identificador de la cita: ${datos.solicitud.cita}`
    await cargar()
  } catch (f) {
    fallo(f)
  } finally {
    operando.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <main class="contenedor">
    <h1>Solicitudes de citas</h1>
    <p>Una fecha preferida no reserva horario. La conversión crea una cita en estado PENDIENTE después de validar disponibilidad.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>
    <section class="tarjeta">
      <h2>Buscar solicitudes</h2>
      <form class="formulario-grid" @submit.prevent="cargar">
        <label>Nombre, correo o identificador<input v-model="filtro.buscar" maxlength="80" /></label>
        <label>Estado<select v-model="filtro.estado"><option value="">Todos</option>
          <option value="PENDIENTE">Pendiente</option><option value="ATENDIDA">Atendida</option>
          <option value="RECHAZADA">Rechazada</option></select></label>
        <button type="submit">Buscar</button>
      </form>
      <p v-if="cargando" role="status">Cargando solicitudes…</p>
      <div v-else-if="!error" class="tabla-contenedor"><table>
        <thead><tr><th>Recibida</th><th>Solicitante</th><th>Servicio</th><th>Fecha preferida</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody><tr v-for="item in solicitudes" :key="item.id">
          <td>{{ new Date(item.creadoEn).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }) }}</td>
          <td>{{ item.nombreSolicitante }}</td><td>{{ nombreServicio(item.servicio) }}</td>
          <td>{{ item.fechaPreferida }}</td><td>{{ item.estado }}</td>
          <td><button type="button" class="secundario" @click="ver(item)">Ver detalle</button></td>
        </tr><tr v-if="!solicitudes.length"><td colspan="6">No hay solicitudes para este filtro.</td></tr></tbody>
      </table></div>
    </section>
    <p v-if="cargandoDetalle" role="status">Cargando detalle…</p>
    <section v-if="detalle && !cargandoDetalle" class="tarjeta">
      <h2>Detalle de la solicitud</h2>
      <p>Identificador: {{ detalle.id }} · Estado: {{ detalle.estado }}</p>
      <p>Solicitante: {{ detalle.nombreSolicitante }}</p>
      <p>Correo: {{ detalle.correo }} · Teléfono: {{ detalle.telefono }}</p>
      <p>Servicio: {{ nombreServicio(detalle.servicio) }}</p>
      <p>Fecha preferida: {{ detalle.fechaPreferida }}. Esta fecha no es una cita confirmada.</p>
      <p class="texto-preservado">Mensaje: {{ detalle.mensajeAdicional || 'Sin mensaje adicional' }}</p>
      <p v-if="detalle.cita"><strong>Cita relacionada:</strong> {{ detalle.cita }}</p>
      <template v-if="detalle.estado === 'PENDIENTE'">
        <button type="button" class="secundario" :disabled="operando" @click="rechazar">Rechazar solicitud</button>
        <h3>Convertir en cita</h3>
        <p>Selecciona un paciente ya registrado y un profesional activo. La fecha y hora efectiva pueden diferir de la fecha preferida.</p>
        <form class="formulario-grid" @submit.prevent="convertir">
          <label>Buscar paciente por nombre o código<input v-model="buscarPaciente" maxlength="80" /></label>
          <button type="button" class="secundario" @click="buscarPacientes">Buscar pacientes</button>
          <label>Paciente activo<select v-model="conversion.paciente" required><option disabled value="">Selecciona un paciente</option>
            <option v-for="p in pacientes" :key="p.id" :value="p.id">{{ p.nombre }} ({{ p.codigo || p.id }})</option></select></label>
          <label>Profesional activo<select v-model="conversion.profesional" required><option disabled value="">Selecciona un profesional</option>
            <option v-for="p in profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option></select></label>
          <label>Fecha efectiva<input v-model="conversion.fecha" type="date" required /></label>
          <label>Hora de inicio en Guatemala<input v-model="conversion.horaInicio" type="time" required /></label>
          <button type="submit" :disabled="operando">{{ operando ? 'Creando cita…' : 'Crear cita y atender solicitud' }}</button>
        </form>
        <p v-if="!pacientes.length">No hay pacientes activos en la búsqueda. Regístralo primero en <RouterLink to="/pacientes">Pacientes</RouterLink>.</p>
        <p v-if="!profesionales.length">No hay profesionales activos. Solicita al administrador que registre uno.</p>
      </template>
    </section>
  </main>
</template>
