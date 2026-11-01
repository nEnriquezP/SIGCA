<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { fechaCorta, fechaHoraGuatemala, etiquetaEstado, precioQuetzales } from '../utils/formatoCita.js'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'
import PacientesActivosSelector from '../components/PacientesActivosSelector.vue'
import ConfirmarCita from '../components/ConfirmarCita.vue'
import ImagenVista from '../components/ImagenVista.vue'
import AvatarUsuario from '../components/AvatarUsuario.vue'
import { avisoEspera, diasHasta, fechaMaximaGuatemala, hoyGuatemala } from '../utils/fechasCita.js'
import { mostrarError } from '../services/avisos.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'

const route = useRoute()
const router = useRouter()
const sesion = useSesionStore()
const gestiona = computed(() => sesion.tienePermiso('CITAS_GESTIONAR'))
const citas = ref([])
const total = ref(0)
const pagina = ref(0)
const filtro = ref({ paciente: String(route.query.paciente || ''),
  profesional: '', fecha: String(route.query.fecha || ''), estado: '' })
const opciones = ref({ servicios: [], profesionales: [] })
const pacienteElegido = ref(null)
const nueva = ref(formularioVacio())
const detalle = ref(null)
const reprogramacion = ref(null)
const reprogramacionOriginal = ref('')
const cargando = ref(false)
const operando = ref(false)
const error = ref('')
const aviso = ref('')
const confirmacionCita = ref(null)
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
    const datos = await solicitarApi('/api/citas/opciones', { token: sesion.token,
      silencioso: true })
    opciones.value = { servicios: datos.servicios, profesionales: datos.profesionales }
    if (nueva.value.servicio && !datos.servicios.some((s) => s.id === nueva.value.servicio)) {
      nueva.value.servicio = ''
      aviso.value = 'El servicio seleccionado ya no está activo. Elige otro.'
    }
    if (nueva.value.profesional && !datos.profesionales.some((p) => p.id === nueva.value.profesional)) {
      nueva.value.profesional = ''
      aviso.value = 'El profesional seleccionado ya no está activo. Elige otro.'
    }
    if (reprogramacion.value?.profesional &&
        !datos.profesionales.some((p) => p.id === reprogramacion.value.profesional)) {
      reprogramacion.value.profesional = ''
      aviso.value = 'El profesional de la reprogramación ya no está activo. Elige otro.'
    }
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
function prepararConfirmacion(tipo) {
  if (operando.value || confirmacionCita.value) return
  const datos = tipo === 'nueva' ? nueva.value : reprogramacion.value
  const paciente = tipo === 'nueva' ? null : detalle.value?.paciente
  const dias = diasHasta(datos?.fecha)
  if (dias === null || dias < 0 || dias > 365 ||
      (dias === 0 && datos.horaInicio <= new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date()))) {
    mostrarError('Elige una fecha y hora futuras dentro de los próximos 365 días de Guatemala.', 'fecha')
    return
  }
  if (tipo === 'nueva' && !nueva.value.paciente) {
    mostrarError('Selecciona un paciente activo.', 'paciente')
    return
  }
  const nombre = tipo === 'nueva' ?
    `${pacienteElegido.value?.codigo || 'Sin código'} · ${pacienteElegido.value?.nombre || ''}` :
    `${paciente.codigo || 'Sin código'} · ${paciente.nombre}`
  confirmacionCita.value = { tipo, paciente: nombre || 'Paciente seleccionado',
    fecha: datos.fecha, hora: datos.horaInicio }
}
function volverEditar() { if (!operando.value) confirmacionCita.value = null }
async function confirmarCita() {
  if (!confirmacionCita.value || operando.value) return
  if (confirmacionCita.value.tipo === 'nueva') await programar()
  else await guardarReprogramacion()
}
async function programar() {
  if (operando.value) return
  operando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const datos = await solicitarApi('/api/citas', { method: 'POST', token: sesion.token,
      body: nueva.value })
    nueva.value = formularioVacio()
    pacienteElegido.value = null
    confirmacionCita.value = null
    aviso.value = 'Cita programada en estado pendiente.'
    await cargar()
    await ver(datos.cita.id)
  } catch (err) { confirmacionCita.value = null; fallo(err) } finally { operando.value = false }
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
  if (!detalle.value || !reprogramacion.value || operando.value) return
  operando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const id = detalle.value.id
    await solicitarApi(`/api/citas/${id}`, { method: 'PUT', token: sesion.token,
      body: reprogramacion.value })
    reprogramacion.value = null
    reprogramacionOriginal.value = ''
    confirmacionCita.value = null
    aviso.value = 'Cita reprogramada.'
    await cargar()
    await ver(id)
  } catch (err) { confirmacionCita.value = null; fallo(err) } finally { operando.value = false }
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
useOpcionesVivas(cargarOpciones, ['servicios', 'usuarios'])
</script>

<template>
  <main class="contenedor">
    <h1>Citas</h1>
    <p>Los horarios corresponden a Guatemala. La duración y el precio de cada cita quedan guardados al programarla.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="gestiona" class="tarjeta">
      <h2>Programar cita</h2>
      <form class="formulario-grid" @submit.prevent="prepararConfirmacion('nueva')">
        <PacientesActivosSelector v-model="nueva.paciente" endpoint="/api/citas/opciones"
          class="campo-ancho" @seleccion="pacienteElegido = $event" @invalido="aviso = $event" />
        <label>Servicio activo <span class="requisito-campo">Obligatorio</span>
          <select v-model="nueva.servicio" data-campo="servicio" required><option disabled value="">Selecciona un servicio</option>
            <option v-for="s in opciones.servicios" :key="s.id" :value="s.id">{{ s.codigo || '' }} · {{ s.nombre }} ({{ s.duracionMinutos }} min, {{ precioQuetzales(s.precioCentavos) }})</option>
          </select></label>
        <label>Profesional activo <span class="requisito-campo">Obligatorio</span>
          <select v-model="nueva.profesional" data-campo="profesional" required><option disabled value="">Selecciona un profesional</option>
            <option v-for="p in opciones.profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select></label>
        <label>Fecha <span class="requisito-campo">Obligatorio</span>
          <input v-model="nueva.fecha" data-campo="fecha" type="date" :min="hoyGuatemala()"
            :max="fechaMaximaGuatemala()" required />
          <small v-if="nueva.fecha" role="status">{{ avisoEspera(nueva.fecha) }}</small></label>
        <label>Hora de inicio en Guatemala <span class="requisito-campo">Obligatorio</span>
          <input v-model="nueva.horaInicio" data-campo="horaInicio" type="time" required /></label>
        <label class="campo-ancho">Observaciones administrativas <span class="requisito-campo">Opcional</span>
          <textarea v-model="nueva.observacionesAdministrativas" maxlength="2000" /></label>
        <button type="submit" :disabled="operando">Revisar cita</button>
      </form>
      <p v-if="!opciones.profesionales.length">No hay profesionales activos disponibles.</p>
    </section>

    <section class="tarjeta">
      <h2>{{ filtro.paciente ? 'Historial de citas del paciente' : 'Consultar citas' }}</h2>
      <form class="formulario-grid" @submit.prevent="filtrar">
        <label>Fecha <span class="requisito-campo">Opcional</span><input v-model="filtro.fecha" type="date" /></label>
        <label>Estado <span class="requisito-campo">Opcional</span><select v-model="filtro.estado"><option value="">Todos</option>
          <option v-for="estado in ['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'CANCELADA']"
            :key="estado" :value="estado">{{ etiquetaEstado(estado) }}</option></select></label>
        <label v-if="gestiona">Profesional <span class="requisito-campo">Opcional</span><select v-model="filtro.profesional">
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
      <div class="personas-cita">
        <article class="persona-cita">
          <AvatarUsuario :usuario="{ ...detalle.profesional, fotografia: detalle.profesional.imagen }" />
          <div><h3>Profesional</h3><p>{{ detalle.profesional.nombre }}</p></div>
        </article>
        <article class="persona-cita">
          <ImagenVista :valor="detalle.paciente.imagen || ''" alt="Fotografía del paciente" silueta />
          <div><h3>Paciente</h3><p>{{ detalle.paciente.nombre }}</p>
            <p>{{ detalle.paciente.codigo || 'Sin código asignado' }}</p></div>
        </article>
      </div>
      <dl class="datos-cita">
        <div><dt>Servicio</dt><dd>{{ detalle.servicio.nombre }}</dd></div>
        <div><dt>Fecha</dt><dd>{{ fechaCorta(detalle.fecha) }}</dd></div>
        <div><dt>Horario en Guatemala</dt><dd>{{ detalle.horaInicio }}–{{ detalle.horaFin }}</dd></div>
        <div><dt>Duración histórica</dt><dd>{{ detalle.duracionMinutos }} minutos</dd></div>
        <div><dt>Precio histórico</dt><dd>{{ precioQuetzales(detalle.precioCentavos) }}</dd></div>
        <div><dt>Estado</dt><dd><span class="estado-cita" :class="`estado-${detalle.estado.toLowerCase()}`">{{ etiquetaEstado(detalle.estado) }}</span></dd></div>
        <div><dt>Creada</dt><dd>{{ fechaHoraGuatemala(detalle.creadoEn) }} (Guatemala)</dd></div>
        <div v-if="gestiona"><dt>Observaciones administrativas</dt><dd>{{ detalle.observacionesAdministrativas || 'Sin observaciones' }}</dd></div>
      </dl>
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
      <form v-if="reprogramacion" class="formulario-grid" @submit.prevent="prepararConfirmacion('reprogramacion')">
        <h3 class="campo-ancho">Reprogramar cita</h3>
        <p class="campo-ancho">Se conservan paciente, servicio, duración y precio histórico.</p>
        <label>Fecha <span class="requisito-campo">Obligatorio</span>
          <input v-model="reprogramacion.fecha" data-campo="fecha" type="date" :min="hoyGuatemala()"
            :max="fechaMaximaGuatemala()" required />
          <small role="status">{{ avisoEspera(reprogramacion.fecha) }}</small></label>
        <label>Hora de inicio en Guatemala <span class="requisito-campo">Obligatorio</span>
          <input v-model="reprogramacion.horaInicio" data-campo="horaInicio" type="time" required /></label>
        <label>Profesional activo <span class="requisito-campo">Obligatorio</span>
          <select v-model="reprogramacion.profesional" data-campo="profesional" required>
          <option v-for="p in opciones.profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
        </select></label>
        <label class="campo-ancho">Observaciones administrativas <span class="requisito-campo">Opcional</span>
          <textarea v-model="reprogramacion.observacionesAdministrativas" maxlength="2000" /></label>
        <div class="acciones campo-ancho">
          <button type="submit" :disabled="operando">Revisar reprogramación</button>
          <button type="button" class="secundario" @click="cancelarReprogramacion">Cerrar</button>
        </div>
      </form>
    </section>
    <ConfirmarCita :datos="confirmacionCita" :ocupada="operando"
      @confirmar="confirmarCita" @volver="volverEditar" />
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
  </main>
</template>
