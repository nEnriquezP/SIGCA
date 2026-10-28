<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const responsables = ref([])
const buscar = ref('')
const error = ref('')
const aviso = ref('')
const cargando = ref(false)
const guardando = ref(false)
const edicion = ref(null)
const detalle = ref(null)
const nuevo = ref(vacio())

function vacio() {
  return { fotografia: '', nombres: '', apellidos: '', parentesco: '', telefono: '', correo: '', direccion: '' }
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
    const query = buscar.value.trim() ? `?buscar=${encodeURIComponent(buscar.value.trim())}` : ''
    const datos = await solicitarApi(`/api/responsables${query}`, { token: sesion.token })
    responsables.value = datos.responsables
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    cargando.value = false
  }
}

async function crear() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi('/api/responsables', { method: 'POST', token: sesion.token, body: nuevo.value })
    nuevo.value = vacio()
    aviso.value = 'Responsable registrado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

function editar(responsable) {
  edicion.value = { ...responsable }
  detalle.value = null
  error.value = ''
  aviso.value = ''
}

async function guardar() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { id, ...datos } = edicion.value
    await solicitarApi(`/api/responsables/${id}`, { method: 'PUT', token: sesion.token, body: datos })
    edicion.value = null
    aviso.value = 'Responsable actualizado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

async function consultar(responsable) {
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/responsables/${responsable.id}`, { token: sesion.token })
    detalle.value = datos.responsable
    edicion.value = null
  } catch (errorApi) {
    fallo(errorApi)
  }
}

onMounted(cargar)
</script>

<template>
  <main class="contenedor">
    <h1>Responsables</h1>
    <p>Registra y consulta responsables. La asociación con uno o varios pacientes se realiza en Pacientes.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section class="tarjeta">
      <h2>Registrar responsable</h2>
      <form class="formulario-grid" @submit.prevent="crear">
        <label>Fotografía (URL o ruta)<input v-model.trim="nuevo.fotografia" required maxlength="500" placeholder="https://… o /imagenes/…" /></label>
        <label>Nombres<input v-model.trim="nuevo.nombres" required maxlength="120" /></label>
        <label>Apellidos<input v-model.trim="nuevo.apellidos" required maxlength="120" /></label>
        <label>Parentesco<input v-model.trim="nuevo.parentesco" required maxlength="80" /></label>
        <label>Teléfono<input v-model.trim="nuevo.telefono" type="tel" required maxlength="30" /></label>
        <label>Correo electrónico<input v-model.trim="nuevo.correo" type="email" required maxlength="254" /></label>
        <label>Dirección<input v-model.trim="nuevo.direccion" required maxlength="300" /></label>
        <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Registrar' }}</button>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Consultar y buscar</h2>
      <form @submit.prevent="cargar">
        <label>Identificador, nombre, apellido, correo o teléfono<input v-model="buscar" maxlength="80" /></label>
        <button type="submit">Buscar</button>
      </form>
      <p v-if="cargando">Cargando responsables…</p>
      <div v-else class="tabla-contenedor">
        <table>
          <thead><tr><th>Identificador</th><th>Nombre</th><th>Parentesco</th><th>Teléfono</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="responsable in responsables" :key="responsable.id">
              <td>{{ responsable.id }}</td>
              <td>{{ responsable.nombres }} {{ responsable.apellidos }}</td>
              <td>{{ responsable.parentesco }}</td>
              <td>{{ responsable.telefono }}</td>
              <td class="acciones">
                <button type="button" class="secundario" @click="consultar(responsable)">Consultar</button>
                <button type="button" class="secundario" @click="editar(responsable)">Modificar</button>
              </td>
            </tr>
            <tr v-if="!responsables.length"><td colspan="5">No hay responsables en esta búsqueda.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="detalle" class="tarjeta">
      <h2>Detalle del responsable</h2>
      <p><strong>{{ detalle.nombres }} {{ detalle.apellidos }}</strong> · {{ detalle.parentesco }}</p>
      <p>Correo: {{ detalle.correo }} · Teléfono: {{ detalle.telefono }}</p>
      <p>Dirección: {{ detalle.direccion }}</p>
      <p>Fotografía: <a :href="detalle.fotografia" target="_blank" rel="noopener noreferrer">Abrir</a></p>
      <h3>Pacientes asociados</h3>
      <ul v-if="detalle.pacientes.length">
        <li v-for="paciente in detalle.pacientes" :key="paciente.id">
          {{ paciente.nombres }} {{ paciente.apellidos }} ({{ paciente.codigo || paciente.id }} · {{ paciente.estado }})
        </li>
      </ul>
      <p v-else>No tiene pacientes asociados.</p>
    </section>

    <section v-if="edicion" class="tarjeta">
      <h2>Modificar responsable</h2>
      <form class="formulario-grid" @submit.prevent="guardar">
        <label>Fotografía (URL o ruta)<input v-model.trim="edicion.fotografia" required maxlength="500" /></label>
        <label>Nombres<input v-model.trim="edicion.nombres" required maxlength="120" /></label>
        <label>Apellidos<input v-model.trim="edicion.apellidos" required maxlength="120" /></label>
        <label>Parentesco<input v-model.trim="edicion.parentesco" required maxlength="80" /></label>
        <label>Teléfono<input v-model.trim="edicion.telefono" type="tel" required maxlength="30" /></label>
        <label>Correo electrónico<input v-model.trim="edicion.correo" type="email" required maxlength="254" /></label>
        <label>Dirección<input v-model.trim="edicion.direccion" required maxlength="300" /></label>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Guardar cambios</button>
          <button type="button" class="secundario" @click="edicion = null">Cancelar</button>
        </div>
      </form>
    </section>
  </main>
</template>
