<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { fechaCorta, fechaHoraGuatemala, etiquetaEstado, precioQuetzales } from '../utils/formatoCita.js'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'

const route = useRoute()
const router = useRouter()
const sesion = useSesionStore()
const gestiona = computed(() => sesion.tienePermiso('CITAS_GESTIONAR'))
const citas = ref([])
const total = ref(0)
const pagina = ref(0)
const filtro = ref({ paciente: String(route.query.paciente || ''),
  profesional: '', fecha: String(route.query.fecha || ''), estado: '' })
const opciones = ref({ pacientes: [], servicios: [], profesionales: [] })
const buscarPaciente = ref('')
const nueva = ref(formularioVacio())
const detalle = ref(null)
const reprogramacion = ref(null)
const reprogramacionOriginal = ref('')
const cargando = ref(false)
const operando = ref(false)
const error = ref('')
const aviso = ref('')
const hayCambios = computed(() => JSON.stringify(nueva.value) !== JSON.stringify(formularioVacio()) ||
  Boolean(reprogramacion.value && JSON.stringify(reprogramacion.value) !== reprogramacionOriginal.value))
const { advertenciaVisible, confirmarSalida, seguirEditando, salirSinGuardar } =
  useCambiosSinGuardar(hayCambios)

function formularioVacio() {
  return { paciente: '', servicio: '', profesional: '', fecha: '', horaInicio: '',
    observacionesAdministrativas: '' }
}
function fallo(err) {
  if (err.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = err.message || 'No se pudo completar la operación'
}
function etiquetaPaciente(cita) {
  return `${cita.paciente.codigo || 'Sin código'} · ${cita.paciente.nombre}`
}
function rutaLista() {
  const parametros = new URLSearchParams({ pagina: String(pagina.value) })
  for (const [clave, valor] of Object.entries(filtro.value)) {
    if (valor) parametros.set(clave, valor)
  }
  return `/api/citas?${parametros}`
}
async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const datos = await solicitarApi(rutaLista(), { token: sesion.token })
    citas.value = datos.citas
    total.value = datos.total
  } catch (err) {
    fallo(err)
  } finally {
    cargando.value = false
  }
}
async function filtrar() { pagina.value = 0; await cargar() }
async function moverPagina(direccion) {
  pagina.value += direccion
  await cargar()
}
async function cargarOpciones() {
  if (!gestiona.value) return
  try {
    const query = buscarPaciente.value.trim() ?
      `?buscarPaciente=${encodeURIComponent(buscarPaciente.value.trim())}` : ''
    const datos = await solicitarApi(`/api/citas/opciones${query}`, { token: sesion.token })
    const actual = opciones.value.pacientes.find((p) => p.id === nueva.value.paciente)
    opciones.value = { ...datos, pacientes: actual && !datos.pacientes.some((p) => p.id === actual.id) ?
      [actual, ...datos.pacientes] : datos.pacientes }
  } catch (err) { fallo(err) }
}
async function ver(id) {
  if (reprogramacion.value && !await confirmarSalida()) return
  error.value = ''
  try {
    detalle.value = (await solicitarApi(`/api/citas/${id}`, { token: sesion.token })).cita
    reprogramacion.value = null
    reprogramacionOriginal.value = ''
  } catch (err) { fallo(err) }
}
async function programar() {
  operando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const datos = await solicitarApi('/api/citas', { method: 'POST', token: sesion.token,
      body: nueva.value })
    nueva.value = formularioVacio()
    buscarPaciente.value = ''
    aviso.value = 'Cita programada en estado pendiente.'
    await cargar()
    await ver(datos.cita.id)
  } catch (err) { fallo(err) } finally { operando.value = false }
}
async function iniciarReprogramacion() {
  if (reprogramacion.value && !await confirmarSalida()) return
  if (!detalle.value) return
  reprogramacion.value = { fecha: detalle.value.fecha, horaInicio: detalle.value.horaInicio,
    profesional: detalle.value.profesional.id,
    observacionesAdministrativas: detalle.value.observacionesAdministrativas || '' }
  reprogramacionOriginal.value = JSON.stringify(reprogramacion.value)
}
async function cancelarReprogramacion() {
  if (reprogramacion.value && !await confirmarSalida()) return
  reprogramacion.value = null
  reprogramacionOriginal.value = ''
}
async function guardarReprogramacion() {
  if (!detalle.value || !reprogramacion.value) return
  operando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const id = detalle.value.id
    await solicitarApi(`/api/citas/${id}`, { method: 'PUT', token: sesion.token,
      body: reprogramacion.value })
    reprogramacion.value = null
    reprogramacionOriginal.value = ''
    aviso.value = 'Cita reprogramada.'
    await cargar()
    await ver(id)
  } catch (err) { fallo(err) } finally { operando.value = false }
}
async function cambiarEstado(estado) {
  if (!detalle.value || !window.confirm(`¿Cambiar la cita a ${etiquetaEstado(estado)}?`)) return
  operando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const id = detalle.value.id
    await solicitarApi(`/api/citas/${id}/estado`, { method: 'PATCH', token: sesion.token,
      body: { estado } })
    aviso.value = `Cita ${etiquetaEstado(estado).toLowerCase()}.`
    await cargar()
    await ver(id)
  } catch (err) { fallo(err) } finally { operando.value = false }
}

watch(() => [route.query.paciente, route.query.fecha, route.query.id], async ([paciente, fecha, id]) => {
  filtro.value.paciente = String(paciente || '')
  filtro.value.fecha = String(fecha || '')
  pagina.value = 0
  await cargar()
  if (id) await ver(String(id))
})
onMounted(async () => {
  await Promise.all([cargar(), cargarOpciones()])
  if (route.query.id) await ver(String(route.query.id))
})
</script>

<template>
  <main class="contenedor">
    <h1>Citas</h1>
    <p>Los horarios corresponden a Guatemala. La duración y el precio de cada cita quedan guardados al programarla.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="gestiona" class="tarjeta">
      <h2>Programar cita</h2>
      <form class="formulario-grid" @submit.prevent="programar">
        <label>Buscar paciente activo por código o nombre
          <input v-model="buscarPaciente" maxlength="80" /></label>
        <button type="button" class="secundario" @click="cargarOpciones">Buscar pacientes</button>
        <label>Paciente activo
          <select v-model="nueva.paciente" required><option disabled value="">Selecciona un paciente</option>
            <option v-for="p in opciones.pacientes" :key="p.id" :value="p.id">{{ p.codigo || 'Sin código' }} · {{ p.nombre }}</option>
          </select></label>
        <label>Servicio activo
          <select v-model="nueva.servicio" required><option disabled value="">Selecciona un servicio</option>
            <option v-for="s in opciones.servicios" :key="s.id" :value="s.id">{{ s.codigo || '' }} · {{ s.nombre }} ({{ s.duracionMinutos }} min, {{ precioQuetzales(s.precioCentavos) }})</option>
          </select></label>
        <label>Profesional activo
          <select v-model="nueva.profesional" required><option disabled value="">Selecciona un profesional</option>
            <option v-for="p in opciones.profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select></label>
        <label>Fecha <input v-model="nueva.fecha" type="date" required /></label>
        <label>Hora de inicio en Guatemala <input v-model="nueva.horaInicio" type="time" required /></label>
        <label class="campo-ancho">Observaciones administrativas (opcional)
          <textarea v-model="nueva.observacionesAdministrativas" maxlength="2000" /></label>
        <button type="submit" :disabled="operando">{{ operando ? 'Guardando…' : 'Programar cita' }}</button>
      </form>
      <p v-if="!opciones.profesionales.length">No hay profesionales activos disponibles.</p>
    </section>

    <section class="tarjeta">
      <h2>{{ filtro.paciente ? 'Historial de citas del paciente' : 'Consultar citas' }}</h2>
      <form class="formulario-grid" @submit.prevent="filtrar">
        <label>Fecha <input v-model="filtro.fecha" type="date" /></label>
        <label>Estado <select v-model="filtro.estado"><option value="">Todos</option>
          <option v-for="estado in ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA']"
            :key="estado" :value="estado">{{ etiquetaEstado(estado) }}</option></select></label>
        <label v-if="gestiona">Profesional <select v-model="filtro.profesional">
          <option value="">Todos</option><option v-for="p in opciones.profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select></label>
        <button type="submit">Buscar</button>
        <button v-if="filtro.paciente" type="button" class="secundario"
          @click="router.push({ name: 'citas' })">Ver todas las citas</button>
      </form>
      <p v-if="cargando" role="status">Cargando citas…</p>
      <template v-else>
        <p>{{ total }} cita(s) encontradas. Página {{ pagina + 1 }}.</p>
        <div class="tabla-contenedor"><table>
          <thead><tr><th>Fecha</th><th>Hora</th><th>Paciente</th><th>Servicio</th><th>Profesional</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody><tr v-for="cita in citas" :key="cita.id">
            <td>{{ fechaCorta(cita.fecha) }}</td><td>{{ cita.horaInicio }}–{{ cita.horaFin }}</td>
            <td>{{ etiquetaPaciente(cita) }}</td><td>{{ cita.servicio.nombre }}</td>
            <td>{{ cita.profesional.nombre }}</td>
            <td><span class="estado-cita" :class="`estado-${cita.estado.toLowerCase()}`">{{ etiquetaEstado(cita.estado) }}</span></td>
            <td><button type="button" class="secundario" @click="ver(cita.id)">Ver detalle</button></td>
          </tr><tr v-if="!citas.length"><td colspan="7">No hay citas para estos filtros.</td></tr></tbody>
        </table></div>
        <div class="acciones">
          <button type="button" class="secundario" :disabled="pagina === 0" @click="moverPagina(-1)">Anterior</button>
          <button type="button" class="secundario" :disabled="(pagina + 1) * 100 >= total" @click="moverPagina(1)">Siguiente</button>
        </div>
      </template>
    </section>

    <section v-if="detalle" class="tarjeta">
      <h2>Detalle de la cita</h2>
      <p><strong>{{ etiquetaPaciente(detalle) }}</strong> · {{ detalle.servicio.nombre }}</p>
      <p>Profesional: {{ detalle.profesional.nombre }}</p>
      <p>Fecha: {{ fechaCorta(detalle.fecha) }} · {{ detalle.horaInicio }}–{{ detalle.horaFin }} (Guatemala)</p>
      <p>Duración histórica: {{ detalle.duracionMinutos }} minutos · Precio histórico: {{ precioQuetzales(detalle.precioCentavos) }}</p>
      <p>Estado: <span class="estado-cita" :class="`estado-${detalle.estado.toLowerCase()}`">{{ etiquetaEstado(detalle.estado) }}</span></p>
      <p>Creada: {{ fechaHoraGuatemala(detalle.creadoEn) }} (Guatemala)</p>
      <p v-if="gestiona">Observaciones administrativas: {{ detalle.observacionesAdministrativas || 'Sin observaciones' }}</p>
      <p v-if="detalle.solicitudCita && gestiona">Origen: solicitud convertida.
        <RouterLink :to="`/gestion-solicitudes`">Abrir solicitudes</RouterLink></p>
      <div class="acciones">
        <button v-if="gestiona && detalle.estado === 'PENDIENTE'" type="button" :disabled="operando"
          @click="cambiarEstado('CONFIRMADA')">Confirmar</button>
        <button v-if="gestiona && ['PENDIENTE', 'CONFIRMADA'].includes(detalle.estado)" type="button"
          class="secundario" :disabled="operando" @click="iniciarReprogramacion">Reprogramar</button>
        <button v-if="gestiona && ['PENDIENTE', 'CONFIRMADA'].includes(detalle.estado)" type="button"
          class="secundario" :disabled="operando" @click="cambiarEstado('CANCELADA')">Cancelar cita</button>
        <button v-if="!gestiona && detalle.estado === 'CONFIRMADA'" type="button" :disabled="operando"
          @click="cambiarEstado('COMPLETADA')">Marcar completada</button>
      </div>
      <form v-if="reprogramacion" class="formulario-grid" @submit.prevent="guardarReprogramacion">
        <h3 class="campo-ancho">Reprogramar cita</h3>
        <p class="campo-ancho">Se conservan paciente, servicio, duración y precio histórico.</p>
        <label>Fecha <input v-model="reprogramacion.fecha" type="date" required /></label>
        <label>Hora de inicio en Guatemala <input v-model="reprogramacion.horaInicio" type="time" required /></label>
        <label>Profesional activo <select v-model="reprogramacion.profesional" required>
          <option v-for="p in opciones.profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select></label>
        <label class="campo-ancho">Observaciones administrativas
          <textarea v-model="reprogramacion.observacionesAdministrativas" maxlength="2000" /></label>
        <div class="acciones campo-ancho">
          <button type="submit" :disabled="operando">Guardar reprogramación</button>
          <button type="button" class="secundario" @click="cancelarReprogramacion">Cerrar</button>
        </div>
      </form>
    </section>
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
  </main>
</template>
