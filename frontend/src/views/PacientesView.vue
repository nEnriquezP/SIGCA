<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const pacientes = ref([])
const responsablesDisponibles = ref([])
const buscarResponsable = ref('')
const buscar = ref('')
const estadoFiltro = ref('')
const error = ref('')
const aviso = ref('')
const cargando = ref(false)
const guardando = ref(false)
const edicion = ref(null)
const detalle = ref(null)
const nuevo = ref(vacio())
const sexos = [
  ['FEMENINO', 'Femenino'], ['MASCULINO', 'Masculino'], ['OTRO', 'Otro'],
  ['PREFIERE_NO_DECIR', 'Prefiere no decir'],
]

function vacio() {
  return { fotografia: '', nombres: '', apellidos: '', fechaNacimiento: '', sexo: '',
    telefono: '', direccion: '', fechaInicioProceso: '', observacionesAdministrativas: '',
    responsables: [] }
}

function formatearFecha(fecha) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha
}

function fallo(errorApi) {
  if (errorApi.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = errorApi.message || 'No se pudo completar la operación'
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const parametros = new URLSearchParams()
    if (buscar.value.trim()) parametros.set('buscar', buscar.value.trim())
    if (estadoFiltro.value) parametros.set('estado', estadoFiltro.value)
    const query = parametros.size ? `?${parametros}` : ''
    const datos = await solicitarApi(`/api/pacientes${query}`, { token: sesion.token })
    pacientes.value = datos.pacientes
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    cargando.value = false
  }
}

async function cargarResponsables() {
  try {
    const query = buscarResponsable.value.trim() ?
      `?buscar=${encodeURIComponent(buscarResponsable.value.trim())}` : ''
    const datos = await solicitarApi(`/api/responsables${query}`, { token: sesion.token })
    const seleccionados = new Set([
      ...nuevo.value.responsables, ...(edicion.value?.responsables ?? []),
    ])
    const opciones = [...datos.responsables,
      ...responsablesDisponibles.value.filter((item) => seleccionados.has(item.id))]
    responsablesDisponibles.value = [...new Map(opciones.map((item) => [item.id, item])).values()]
  } catch (errorApi) {
    fallo(errorApi)
  }
}

async function crear() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi('/api/pacientes', { method: 'POST', token: sesion.token, body: nuevo.value })
    nuevo.value = vacio()
    aviso.value = 'Paciente registrado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

async function consultar(paciente) {
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/pacientes/${paciente.id}`, { token: sesion.token })
    detalle.value = datos.paciente
    edicion.value = null
  } catch (errorApi) {
    fallo(errorApi)
  }
}

async function editar(paciente) {
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/pacientes/${paciente.id}`, { token: sesion.token })
    edicion.value = { ...datos.paciente,
      responsables: datos.paciente.responsables.map((responsable) => responsable.id) }
    responsablesDisponibles.value = [...new Map([
      ...responsablesDisponibles.value, ...datos.paciente.responsables,
    ].map((item) => [item.id, item])).values()]
    detalle.value = null
  } catch (errorApi) {
    fallo(errorApi)
  }
}

async function guardar() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { id, codigo, edad, estado, ...datos } = edicion.value
    await solicitarApi(`/api/pacientes/${id}`, { method: 'PUT', token: sesion.token, body: datos })
    edicion.value = null
    aviso.value = 'Paciente actualizado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

async function cambiarEstado(paciente) {
  const proximo = paciente.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
  if (!window.confirm(`¿Confirmas cambiar el estado a ${proximo}? No se borrará el registro.`)) return
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi(`/api/pacientes/${paciente.id}/estado`, {
      method: 'PATCH', token: sesion.token, body: { estado: proximo },
    })
    aviso.value = `Paciente ${proximo.toLowerCase()}`
    if (detalle.value?.id === paciente.id) detalle.value.estado = proximo
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  }
}

onMounted(async () => {
  await Promise.all([cargar(), cargarResponsables()])
})
</script>

<template>
  <main class="contenedor">
    <h1>Pacientes</h1>
    <p>Los responsables se registran primero en la sección Responsables y se asocian aquí.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section class="tarjeta">
      <h2>Registrar paciente</h2>
      <form class="formulario-grid" @submit.prevent="crear">
        <label>Fotografía (URL o ruta)<input v-model.trim="nuevo.fotografia" required maxlength="500" placeholder="https://… o /imagenes/…" /></label>
        <label>Nombres<input v-model.trim="nuevo.nombres" required maxlength="120" /></label>
        <label>Apellidos<input v-model.trim="nuevo.apellidos" required maxlength="120" /></label>
        <label>Fecha de nacimiento<input v-model="nuevo.fechaNacimiento" type="date" required /></label>
        <label>Sexo
          <select v-model="nuevo.sexo" required>
            <option disabled value="">Selecciona una opción</option>
            <option v-for="[valor, texto] in sexos" :key="valor" :value="valor">{{ texto }}</option>
          </select>
        </label>
        <label>Teléfono<input v-model.trim="nuevo.telefono" type="tel" required maxlength="30" /></label>
        <label>Dirección<input v-model.trim="nuevo.direccion" required maxlength="300" /></label>
        <label>Inicio del proceso<input v-model="nuevo.fechaInicioProceso" type="date" required /></label>
        <label>Observaciones administrativas<textarea v-model.trim="nuevo.observacionesAdministrativas" maxlength="2000" /></label>
        <fieldset>
          <legend>Responsables asociados</legend>
          <label>Buscar responsable por nombre, correo o identificador
            <input v-model="buscarResponsable" maxlength="80" />
          </label>
          <button type="button" class="secundario" @click="cargarResponsables">Buscar responsables</button>
          <label v-for="responsable in responsablesDisponibles" :key="responsable.id">
            <input v-model="nuevo.responsables" type="checkbox" :value="responsable.id" />
            {{ responsable.nombres }} {{ responsable.apellidos }} ({{ responsable.parentesco }})
          </label>
          <p v-if="!responsablesDisponibles.length">Todavía no hay responsables registrados.</p>
        </fieldset>
        <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Registrar' }}</button>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Consultar y buscar</h2>
      <form class="formulario-grid" @submit.prevent="cargar">
        <label>Código, identificador, nombre, apellido o teléfono<input v-model="buscar" maxlength="80" /></label>
        <label>Estado
          <select v-model="estadoFiltro">
            <option value="">Todos</option><option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </label>
        <button type="submit">Buscar</button>
      </form>
      <p v-if="cargando">Cargando pacientes…</p>
      <div v-else class="tabla-contenedor">
        <table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Edad</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="paciente in pacientes" :key="paciente.id">
              <td>{{ paciente.codigo || 'Pendiente de asignación' }}</td>
              <td>{{ paciente.nombres }} {{ paciente.apellidos }}</td>
              <td>{{ paciente.edad }}</td>
              <td>{{ paciente.estado }}</td>
              <td class="acciones">
                <button type="button" class="secundario" @click="consultar(paciente)">Consultar</button>
                <button type="button" class="secundario" @click="editar(paciente)">Actualizar</button>
                <button type="button" class="secundario" @click="cambiarEstado(paciente)">
                  {{ paciente.estado === 'ACTIVO' ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="!pacientes.length"><td colspan="5">No hay pacientes en esta búsqueda.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="detalle" class="tarjeta">
      <h2>Detalle del paciente</h2>
      <p>Código: <strong>{{ detalle.codigo || 'Pendiente de asignación' }}</strong></p>
      <p><strong>{{ detalle.nombres }} {{ detalle.apellidos }}</strong> · {{ detalle.edad }} años · {{ detalle.estado }}</p>
      <p>Fecha de nacimiento: {{ formatearFecha(detalle.fechaNacimiento) }} · Sexo: {{ detalle.sexo }}</p>
      <p>Teléfono: {{ detalle.telefono }} · Dirección: {{ detalle.direccion }}</p>
      <p>Inicio del proceso: {{ formatearFecha(detalle.fechaInicioProceso) }}</p>
      <p>Observaciones administrativas: {{ detalle.observacionesAdministrativas || 'Sin observaciones' }}</p>
      <p>Fotografía: <a :href="detalle.fotografia" target="_blank" rel="noopener noreferrer">Abrir</a></p>
      <h3>Responsables</h3>
      <ul v-if="detalle.responsables.length">
        <li v-for="responsable in detalle.responsables" :key="responsable.id">
          {{ responsable.nombres }} {{ responsable.apellidos }} ({{ responsable.parentesco }})
        </li>
      </ul>
      <p v-else>No tiene responsables asociados.</p>
      <h3>Citas y pagos</h3>
      <p>La consulta de citas y pagos estará disponible al implementar esos módulos.</p>
    </section>

    <section v-if="edicion" class="tarjeta">
      <h2>Actualizar paciente</h2>
      <form class="formulario-grid" @submit.prevent="guardar">
        <label>Fotografía (URL o ruta)<input v-model.trim="edicion.fotografia" required maxlength="500" /></label>
        <label>Nombres<input v-model.trim="edicion.nombres" required maxlength="120" /></label>
        <label>Apellidos<input v-model.trim="edicion.apellidos" required maxlength="120" /></label>
        <label>Fecha de nacimiento<input v-model="edicion.fechaNacimiento" type="date" required /></label>
        <label>Sexo
          <select v-model="edicion.sexo" required>
            <option v-for="[valor, texto] in sexos" :key="valor" :value="valor">{{ texto }}</option>
          </select>
        </label>
        <label>Teléfono<input v-model.trim="edicion.telefono" type="tel" required maxlength="30" /></label>
        <label>Dirección<input v-model.trim="edicion.direccion" required maxlength="300" /></label>
        <label>Inicio del proceso<input v-model="edicion.fechaInicioProceso" type="date" required /></label>
        <label>Observaciones administrativas<textarea v-model.trim="edicion.observacionesAdministrativas" maxlength="2000" /></label>
        <fieldset>
          <legend>Responsables asociados</legend>
          <label>Buscar responsable por nombre, correo o identificador
            <input v-model="buscarResponsable" maxlength="80" />
          </label>
          <button type="button" class="secundario" @click="cargarResponsables">Buscar responsables</button>
          <label v-for="responsable in responsablesDisponibles" :key="responsable.id">
            <input v-model="edicion.responsables" type="checkbox" :value="responsable.id" />
            {{ responsable.nombres }} {{ responsable.apellidos }} ({{ responsable.parentesco }})
          </label>
        </fieldset>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Guardar cambios</button>
          <button type="button" class="secundario" @click="edicion = null">Cancelar</button>
        </div>
      </form>
    </section>
  </main>
</template>
