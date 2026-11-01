<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import ImagenCampo from '../components/ImagenCampo.vue'
import ImagenVista from '../components/ImagenVista.vue'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'
import { errorActual, mostrarError } from '../services/avisos.js'

const router = useRouter()
const sesion = useSesionStore()
const responsables = ref([])
const pagina = ref(0)
const hayMas = ref(false)
const buscar = ref('')
const error = ref('')
const aviso = ref('')
const cargando = ref(false)
const guardando = ref(false)
const edicion = ref(null)
const edicionOriginal = ref(null)
const detalle = ref(null)
const nuevo = ref(vacio())
const parentescosComunes = ['Madre', 'Padre', 'Hermano/a', 'Abuelo/a', 'Tío/a', 'Tutor/a legal']
const edicionConCambios = computed(() => edicion.value !== null &&
  JSON.stringify(edicion.value) !== edicionOriginal.value)
const hayCambios = computed(() => JSON.stringify(nuevo.value) !== JSON.stringify(vacio()) ||
  edicionConCambios.value)
const { advertenciaVisible, confirmarSalida, seguirEditando, salirSinGuardar } =
  useCambiosSinGuardar(hayCambios)

function vacio() {
  return { fotografia: '', nombres: '', apellidos: '', parentesco: '', telefono: '', correo: '', direccion: '' }
}

function capturarTelefono(evento, datos) {
  const telefono = evento.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 8)
  evento.target.value = telefono
  datos.telefono = telefono
}

function fallo(errorApi) {
  if (errorApi.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = errorApi.message || 'No se pudo completar la operación'
  if (errorActual.value?.mensaje !== error.value) mostrarError(error.value)
}

async function buscarListado() {
  pagina.value = 0
  await cargar()
}

async function moverPagina(direccion) {
  pagina.value = Math.max(0, pagina.value + direccion)
  await cargar()
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const parametros = new URLSearchParams()
    if (buscar.value.trim()) parametros.set('buscar', buscar.value.trim())
    if (pagina.value) parametros.set('pagina', String(pagina.value))
    const query = parametros.size ? `?${parametros}` : ''
    const datos = await solicitarApi(`/api/responsables${query}`, { token: sesion.token })
    responsables.value = datos.responsables
    hayMas.value = Boolean(datos.hayMas)
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    cargando.value = false
  }
}

async function crear() {
  if (!nuevo.value.fotografia) return fallo(new Error('Carga una fotografía del responsable'))
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

async function editar(responsable) {
  if (edicionConCambios.value && !await confirmarSalida()) return
  edicion.value = { ...responsable }
  edicionOriginal.value = JSON.stringify(edicion.value)
  detalle.value = null
  error.value = ''
  aviso.value = ''
}

async function guardar() {
  if (!edicion.value.fotografia) return fallo(new Error('Carga una fotografía del responsable'))
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { id, codigo, ...datos } = edicion.value
    await solicitarApi(`/api/responsables/${id}`, { method: 'PUT', token: sesion.token, body: datos })
    edicion.value = null
    edicionOriginal.value = null
    aviso.value = 'Responsable actualizado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

async function consultar(responsable) {
  if (edicionConCambios.value && !await confirmarSalida()) return
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/responsables/${responsable.id}`, { token: sesion.token })
    detalle.value = datos.responsable
    edicion.value = null
    edicionOriginal.value = null
  } catch (errorApi) {
    fallo(errorApi)
  }
}

async function cancelarEdicion() {
  if (edicionConCambios.value && !await confirmarSalida()) return
  edicion.value = null
  edicionOriginal.value = null
}

onMounted(cargar)
useOpcionesVivas(cargar, ['responsables'])
</script>

<template>
  <main class="contenedor">
    <h1>Responsables</h1>
    <p>Registra y consulta responsables. La asociación con uno o varios pacientes se realiza en Pacientes.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="sesion.tienePermiso('RESPONSABLES_GESTIONAR')" class="tarjeta">
      <h2>Registrar responsable</h2>
      <form class="formulario-responsable" @submit.prevent="crear">
        <div class="paciente-form-layout">
          <div class="paciente-form-datos">
            <h3>Datos del responsable</h3>
            <div class="paciente-campos">
              <label>Nombres <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.nombres" required maxlength="120" /></label>
              <label>Apellidos <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.apellidos" required maxlength="120" /></label>
              <label>Parentesco <span class="requisito-campo">Obligatorio</span>
                <input v-model.trim="nuevo.parentesco" list="parentescos-comunes" required maxlength="80" />
                <small>Elige una sugerencia o escribe otro parentesco.</small>
              </label>
              <label>Teléfono <span class="requisito-campo">Obligatorio</span>
                <input :value="nuevo.telefono" type="tel" inputmode="numeric" autocomplete="tel-national"
                  required minlength="8" maxlength="8" pattern="[1-9][0-9]{7}" placeholder="Ej. 55551234"
                  title="Escribe 8 números; el primero debe ser de 1 a 9" @input="capturarTelefono($event, nuevo)" />
                <small>8 dígitos, sin espacios y sin iniciar con 0.</small>
              </label>
              <label class="paciente-campo-ancho">Correo electrónico <span class="requisito-campo">Obligatorio</span>
                <input v-model.trim="nuevo.correo" type="email" required maxlength="254"
                  pattern="[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,63}" placeholder="usuario@dominio.com"
                  title="Escribe un correo con el formato usuario@dominio.com" />
              </label>
              <label class="paciente-campo-ancho">Dirección <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.direccion" required maxlength="300" /></label>
            </div>
          </div>
          <ImagenCampo v-model="nuevo.fotografia" categoria="responsable" etiqueta="Fotografía del responsable" obligatoria mostrar-requisito proporcion="1:1" />
        </div>
        <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Registrar' }}</button>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Consultar y buscar</h2>
      <form @submit.prevent="buscarListado">
        <label>Código, identificador, nombre, apellido, correo o teléfono <span class="requisito-campo">Opcional</span><input v-model="buscar" maxlength="80" /></label>
        <button type="submit">Buscar</button>
      </form>
      <p v-if="cargando">Cargando responsables…</p>
      <div v-else class="tabla-contenedor">
        <table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Parentesco</th><th>Teléfono</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="responsable in responsables" :key="responsable.id">
              <td>{{ responsable.codigo || 'Pendiente de asignación' }}</td>
              <td>{{ responsable.nombres }} {{ responsable.apellidos }}</td>
              <td>{{ responsable.parentesco }}</td>
              <td>{{ responsable.telefono }}</td>
              <td class="acciones">
                <button type="button" class="secundario" @click="consultar(responsable)">Consultar</button>
                <button v-if="sesion.tienePermiso('RESPONSABLES_GESTIONAR')" type="button" class="secundario" @click="editar(responsable)">Modificar</button>
              </td>
            </tr>
            <tr v-if="!responsables.length"><td colspan="5">No hay responsables en esta búsqueda.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <nav class="acciones" aria-label="Páginas de resultados">
      <button type="button" class="secundario" :disabled="pagina === 0 || cargando" @click="moverPagina(-1)">Anterior</button>
      <span>Página {{ pagina + 1 }}</span>
      <button type="button" class="secundario" :disabled="!hayMas || cargando" @click="moverPagina(1)">Siguiente</button>
    </nav>

    <section v-if="detalle" class="tarjeta">
      <h2>Detalle del responsable</h2>
      <p>Código: <strong>{{ detalle.codigo || 'Pendiente de asignación' }}</strong></p>
      <p><strong>{{ detalle.nombres }} {{ detalle.apellidos }}</strong> · {{ detalle.parentesco }}</p>
      <p>Correo: {{ detalle.correo }} · Teléfono: {{ detalle.telefono }}</p>
      <p>Dirección: {{ detalle.direccion }}</p>
      <ImagenVista :valor="detalle.fotografia" alt="Fotografía del responsable" />
      <h3>Pacientes asociados</h3>
      <ul v-if="detalle.pacientes.length">
        <li v-for="paciente in detalle.pacientes" :key="paciente.id">
          {{ paciente.nombres }} {{ paciente.apellidos }} ({{ paciente.codigo || paciente.id }} · {{ paciente.estado }})
        </li>
      </ul>
      <p v-else>No tiene pacientes asociados.</p>
    </section>

    <section v-if="edicion && sesion.tienePermiso('RESPONSABLES_GESTIONAR')" class="tarjeta">
      <h2>Modificar responsable</h2>
      <form class="formulario-responsable" @submit.prevent="guardar">
        <div class="paciente-form-layout">
          <div class="paciente-form-datos">
            <h3>Datos del responsable</h3>
            <div class="paciente-campos">
              <label>Nombres <span class="requisito-campo">Obligatorio</span><input v-model.trim="edicion.nombres" required maxlength="120" /></label>
              <label>Apellidos <span class="requisito-campo">Obligatorio</span><input v-model.trim="edicion.apellidos" required maxlength="120" /></label>
              <label>Parentesco <span class="requisito-campo">Obligatorio</span>
                <input v-model.trim="edicion.parentesco" list="parentescos-comunes" required maxlength="80" />
                <small>Elige una sugerencia o escribe otro parentesco.</small>
              </label>
              <label>Teléfono <span class="requisito-campo">Obligatorio</span>
                <input :value="edicion.telefono" type="tel" inputmode="numeric" autocomplete="tel-national"
                  required minlength="8" maxlength="8" pattern="[1-9][0-9]{7}" placeholder="Ej. 55551234"
                  title="Escribe 8 números; el primero debe ser de 1 a 9" @input="capturarTelefono($event, edicion)" />
                <small>8 dígitos, sin espacios y sin iniciar con 0.</small>
              </label>
              <label class="paciente-campo-ancho">Correo electrónico <span class="requisito-campo">Obligatorio</span>
                <input v-model.trim="edicion.correo" type="email" required maxlength="254"
                  pattern="[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,63}" placeholder="usuario@dominio.com"
                  title="Escribe un correo con el formato usuario@dominio.com" />
              </label>
              <label class="paciente-campo-ancho">Dirección <span class="requisito-campo">Obligatorio</span><input v-model.trim="edicion.direccion" required maxlength="300" /></label>
            </div>
          </div>
          <ImagenCampo v-model="edicion.fotografia" categoria="responsable" etiqueta="Fotografía del responsable" obligatoria mostrar-requisito proporcion="1:1" />
        </div>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Guardar cambios</button>
          <button type="button" class="secundario" @click="cancelarEdicion">Cancelar</button>
        </div>
      </form>
    </section>
    <datalist id="parentescos-comunes">
      <option v-for="parentesco in parentescosComunes" :key="parentesco" :value="parentesco" />
    </datalist>
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
  </main>
</template>
