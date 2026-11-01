<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import ImagenCampo from '../components/ImagenCampo.vue'
import ImagenVista from '../components/ImagenVista.vue'
import DatosResponsable from '../components/DatosResponsable.vue'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'
import { fechaCorta, etiquetaEstado } from '../utils/formatoCita.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'
import { errorActual, mostrarError } from '../services/avisos.js'
import { incorporarResponsable } from '../utils/estadoFormulario.js'

const router = useRouter()
const sesion = useSesionStore()
const pacientes = ref([])
const pagina = ref(0)
const hayMas = ref(false)
const responsablesDisponibles = ref([])
const listaCompletaResponsables = ref(null)
const paginaResponsables = ref(0)
const hayMasResponsables = ref(false)
const buscarResponsableNuevo = ref('')
const buscarResponsableEdicion = ref('')
const tipoBusquedaResponsables = ref('nuevo')
const buscandoResponsables = ref(false)
const errorBusquedaResponsables = ref('')
let esperaBusquedaResponsables
let controladorResponsables
let secuenciaResponsables = 0
const buscar = ref('')
const estadoFiltro = ref('')
const error = ref('')
const aviso = ref('')
const cargando = ref(false)
const guardando = ref(false)
const edicion = ref(null)
const edicionOriginal = ref(null)
const detalle = ref(null)
const historialCitas = ref([])
const totalCitas = ref(0)
const nuevo = ref(vacio())
const altaResponsable = ref(null)
const destinoResponsable = ref('nuevo')
const guardandoResponsable = ref(false)
const dialogoResponsable = ref(null)
const advertenciaResponsableVisible = ref(false)
const hoy = hoyEnGuatemala()
const fechaMinimaNacimiento = restarAnios(hoy, 120)
const sexos = [
  ['FEMENINO', 'Femenino'], ['MASCULINO', 'Masculino'], ['OTRO', 'Otro'],
  ['PREFIERE_NO_DECIR', 'Prefiere no decir'],
]
const edicionConCambios = computed(() => edicion.value !== null &&
  (JSON.stringify(edicion.value) !== edicionOriginal.value || Boolean(buscarResponsableEdicion.value)))
const responsableConCambios = computed(() => altaResponsable.value !== null &&
  JSON.stringify(altaResponsable.value) !== JSON.stringify(responsableVacio()))
const hayCambios = computed(() => JSON.stringify(nuevo.value) !== JSON.stringify(vacio()) ||
  Boolean(buscarResponsableNuevo.value) || edicionConCambios.value || responsableConCambios.value)
const textoBusquedaResponsables = computed(() => tipoBusquedaResponsables.value === 'edicion' ?
  buscarResponsableEdicion.value : buscarResponsableNuevo.value)
const responsablesVisibles = computed(() => {
  const texto = textoBusquedaResponsables.value.trim().toLocaleLowerCase('es-GT')
  if (!texto) return responsablesDisponibles.value
  return responsablesDisponibles.value.filter((responsable) =>
    [responsable.codigo, responsable.nombres, responsable.apellidos, responsable.correo,
      responsable.telefono, responsable.id].some((valor) =>
      String(valor ?? '').toLocaleLowerCase('es-GT').includes(texto)))
})
const { advertenciaVisible, confirmarSalida, seguirEditando, salirSinGuardar } =
  useCambiosSinGuardar(hayCambios)

function vacio() {
  return { fotografia: '', nombres: '', apellidos: '', fechaNacimiento: '', sexo: '',
    telefono: '', direccion: '', fechaInicioProceso: '', observacionesAdministrativas: '',
    responsables: [] }
}

function responsableVacio() {
  return { fotografia: '', nombres: '', apellidos: '', parentesco: '', telefono: '',
    correo: '', direccion: '' }
}

async function abrirAltaResponsable(destino) {
  if (!sesion.tienePermiso('RESPONSABLES_GESTIONAR') || altaResponsable.value) return
  destinoResponsable.value = destino
  altaResponsable.value = responsableVacio()
  await nextTick()
  dialogoResponsable.value?.showModal()
  dialogoResponsable.value?.querySelector('input:not([type="file"])')?.focus()
}

function descartarAltaResponsable() {
  advertenciaResponsableVisible.value = false
  dialogoResponsable.value?.close()
  altaResponsable.value = null
}

function cancelarAltaResponsable() {
  if (guardandoResponsable.value) return
  if (responsableConCambios.value) advertenciaResponsableVisible.value = true
  else descartarAltaResponsable()
}

async function guardarAltaResponsable() {
  if (!altaResponsable.value || guardandoResponsable.value) return
  if (!altaResponsable.value.fotografia) return fallo(new Error('Carga una fotografía del responsable'))
  guardandoResponsable.value = true
  try {
    const { responsable } = await solicitarApi('/api/responsables', {
      method: 'POST', token: sesion.token, body: altaResponsable.value,
    })
    const destino = destinoResponsable.value === 'edicion' ? edicion : nuevo
    const resultado = incorporarResponsable(destino.value, responsablesDisponibles.value, responsable)
    destino.value = resultado.paciente
    responsablesDisponibles.value = resultado.disponibles
    if (listaCompletaResponsables.value !== null) {
      listaCompletaResponsables.value = [...new Map([
        ...listaCompletaResponsables.value, responsable,
      ].map((item) => [item.id, item])).values()]
    }
    if (destinoResponsable.value === 'edicion') buscarResponsableEdicion.value = ''
    else buscarResponsableNuevo.value = ''
    descartarAltaResponsable()
    error.value = ''
    aviso.value = `Responsable ${responsable.codigo || ''} guardado y seleccionado. ` +
      'Guarda el paciente para asociarlo; el responsable ya existe como registro independiente.'
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardandoResponsable.value = false
  }
}

function formatearFecha(fecha) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : fecha
}

function hoyEnGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const fecha = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${fecha.year}-${fecha.month}-${fecha.day}`
}

function restarAnios(fecha, anios) {
  const dia = new Date(`${fecha}T12:00:00Z`)
  dia.setUTCFullYear(dia.getUTCFullYear() - anios)
  return dia.toISOString().slice(0, 10)
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
    if (estadoFiltro.value) parametros.set('estado', estadoFiltro.value)
    if (pagina.value) parametros.set('pagina', String(pagina.value))
    const query = parametros.size ? `?${parametros}` : ''
    const datos = await solicitarApi(`/api/pacientes${query}`, { token: sesion.token })
    pacientes.value = datos.pacientes
    hayMas.value = Boolean(datos.hayMas)
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    cargando.value = false
  }
}

async function cargarResponsables(tipo = 'nuevo', mas = false) {
  clearTimeout(esperaBusquedaResponsables)
  controladorResponsables?.abort()
  const controlador = new AbortController()
  controladorResponsables = controlador
  const secuencia = ++secuenciaResponsables
  tipoBusquedaResponsables.value = tipo
  buscandoResponsables.value = true
  errorBusquedaResponsables.value = ''
  try {
    const texto = tipo === 'edicion' ? buscarResponsableEdicion.value : buscarResponsableNuevo.value
    const siguiente = mas ? paginaResponsables.value + 1 : 0
    const parametros = new URLSearchParams({ pagina: String(siguiente) })
    if (texto.trim()) parametros.set('buscar', texto.trim())
    const datos = await solicitarApi(`/api/responsables?${parametros}`, {
      token: sesion.token, signal: controlador.signal, silencioso: true,
    })
    if (secuencia !== secuenciaResponsables) return
    if (!texto.trim() && !mas) {
      listaCompletaResponsables.value = datos.hayMas ? null : datos.responsables
    }
    paginaResponsables.value = siguiente
    hayMasResponsables.value = Boolean(datos.hayMas)
    const seleccionados = new Set([
      ...nuevo.value.responsables, ...(edicion.value?.responsables ?? []),
    ])
    const opciones = [...(mas ? responsablesDisponibles.value : []), ...datos.responsables,
      ...responsablesDisponibles.value.filter((item) => seleccionados.has(item.id))]
    responsablesDisponibles.value = [...new Map(opciones.map((item) => [item.id, item])).values()]
  } catch (errorApi) {
    if (secuencia !== secuenciaResponsables || errorApi.name === 'AbortError') return
    if (errorApi.status === 401) fallo(errorApi)
    else errorBusquedaResponsables.value = errorApi.message || 'No se pudo buscar responsables'
  } finally {
    if (secuencia === secuenciaResponsables) {
      buscandoResponsables.value = false
      controladorResponsables = null
    }
  }
}

function programarBusquedaResponsables(tipo) {
  tipoBusquedaResponsables.value = tipo
  clearTimeout(esperaBusquedaResponsables)
  controladorResponsables?.abort()
  ++secuenciaResponsables
  paginaResponsables.value = 0
  hayMasResponsables.value = false
  buscandoResponsables.value = true
  errorBusquedaResponsables.value = ''
  if (listaCompletaResponsables.value !== null) {
    const seleccionados = new Set([
      ...nuevo.value.responsables, ...(edicion.value?.responsables ?? []),
    ])
    responsablesDisponibles.value = [...new Map([
      ...listaCompletaResponsables.value,
      ...responsablesDisponibles.value.filter((item) => seleccionados.has(item.id)),
    ].map((item) => [item.id, item])).values()]
    buscandoResponsables.value = false
    return
  }
  esperaBusquedaResponsables = setTimeout(() => cargarResponsables(tipo), 250)
}

watch(buscarResponsableNuevo, () => programarBusquedaResponsables('nuevo'))
watch(buscarResponsableEdicion, () => {
  if (edicion.value) programarBusquedaResponsables('edicion')
})

onUnmounted(() => {
  clearTimeout(esperaBusquedaResponsables)
  controladorResponsables?.abort()
})

async function crear() {
  if (!nuevo.value.fotografia) return fallo(new Error('Carga una fotografía del paciente'))
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi('/api/pacientes', { method: 'POST', token: sesion.token, body: nuevo.value })
    nuevo.value = vacio()
    buscarResponsableNuevo.value = ''
    aviso.value = 'Paciente registrado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

async function consultar(paciente) {
  if (edicionConCambios.value && !await confirmarSalida()) return
  error.value = ''
  try {
    const [datos, historial] = await Promise.all([
      solicitarApi(`/api/pacientes/${paciente.id}`, { token: sesion.token }),
      sesion.tienePermiso('CITAS_VER') ?
        solicitarApi(`/api/citas?paciente=${paciente.id}`, { token: sesion.token }) :
        Promise.resolve({ citas: [], total: 0 }),
    ])
    detalle.value = datos.paciente
    historialCitas.value = historial.citas
    totalCitas.value = historial.total
    edicion.value = null
    edicionOriginal.value = null
    buscarResponsableEdicion.value = ''
    cargarResponsables('nuevo')
  } catch (errorApi) {
    fallo(errorApi)
  }
}

async function editar(paciente) {
  if (edicionConCambios.value && !await confirmarSalida()) return
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/pacientes/${paciente.id}`, { token: sesion.token })
    edicion.value = { ...datos.paciente,
      responsables: datos.paciente.responsables.map((responsable) => responsable.id) }
    edicionOriginal.value = JSON.stringify(edicion.value)
    buscarResponsableEdicion.value = ''
    responsablesDisponibles.value = [...new Map([
      ...responsablesDisponibles.value, ...datos.paciente.responsables,
    ].map((item) => [item.id, item])).values()]
    detalle.value = null
    cargarResponsables('edicion')
  } catch (errorApi) {
    fallo(errorApi)
  }
}

async function guardar() {
  if (!edicion.value.fotografia) return fallo(new Error('Carga una fotografía del paciente'))
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { id, codigo, edad, estado, ...datos } = edicion.value
    await solicitarApi(`/api/pacientes/${id}`, { method: 'PUT', token: sesion.token, body: datos })
    edicion.value = null
    edicionOriginal.value = null
    buscarResponsableEdicion.value = ''
    cargarResponsables('nuevo')
    aviso.value = 'Paciente actualizado'
    await cargar()
  } catch (errorApi) {
    fallo(errorApi)
  } finally {
    guardando.value = false
  }
}

async function cancelarEdicion() {
  if (edicionConCambios.value && !await confirmarSalida()) return
  edicion.value = null
  edicionOriginal.value = null
  buscarResponsableEdicion.value = ''
  cargarResponsables('nuevo')
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

useOpcionesVivas(() => {
  if (sesion.tienePermiso('RESPONSABLES_VER')) {
    cargarResponsables(edicion.value ? 'edicion' : 'nuevo')
  }
}, ['responsables'])
useOpcionesVivas(cargar, ['pacientes'])

onMounted(async () => {
  await Promise.all([cargar(), sesion.tienePermiso('RESPONSABLES_VER') ? cargarResponsables() : Promise.resolve()])
})
</script>

<template>
  <main class="contenedor">
    <h1>Pacientes</h1>
    <p>Puedes seleccionar un responsable existente o agregarlo aquí sin perder los datos del paciente.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')" class="tarjeta">
      <h2>Registrar paciente</h2>
      <form class="formulario-paciente" @submit.prevent="crear">
        <div class="paciente-form-layout">
          <div class="paciente-form-datos">
            <h3>Datos del paciente</h3>
            <div class="paciente-campos">
              <label>Nombres <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.nombres" required maxlength="120" /></label>
              <label>Apellidos <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.apellidos" required maxlength="120" /></label>
              <label>Fecha de nacimiento <span class="requisito-campo">Obligatorio</span>
                <input v-model="nuevo.fechaNacimiento" type="date" required :min="fechaMinimaNacimiento" :max="hoy" />
                <small>Entre {{ formatearFecha(fechaMinimaNacimiento) }} y hoy.</small>
              </label>
              <label>Sexo <span class="requisito-campo">Obligatorio</span>
                <select v-model="nuevo.sexo" required>
                  <option disabled value="">Selecciona una opción</option>
                  <option v-for="[valor, texto] in sexos" :key="valor" :value="valor">{{ texto }}</option>
                </select>
              </label>
              <label>Teléfono <span class="requisito-campo">Obligatorio</span>
                <input :value="nuevo.telefono" type="tel" inputmode="numeric" autocomplete="tel-national"
                  required minlength="8" maxlength="8" pattern="[1-9][0-9]{7}" placeholder="Ej. 55551234"
                  title="Escribe 8 números; el primero debe ser de 1 a 9" @input="capturarTelefono($event, nuevo)" />
                <small>8 dígitos, sin espacios y sin iniciar con 0.</small>
              </label>
              <label>Inicio del proceso <span class="requisito-campo">Obligatorio</span>
                <input v-model="nuevo.fechaInicioProceso" type="date" required :min="nuevo.fechaNacimiento || undefined" :max="hoy" />
                <small>Desde el nacimiento del paciente hasta hoy.</small>
              </label>
              <label class="paciente-campo-ancho">Dirección <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.direccion" required maxlength="300" /></label>
            </div>
          </div>
          <ImagenCampo v-model="nuevo.fotografia" categoria="paciente" etiqueta="Fotografía del paciente" obligatoria mostrar-requisito proporcion="1:1" />
        </div>
        <label>Observaciones administrativas <span class="requisito-campo">Opcional</span><textarea v-model.trim="nuevo.observacionesAdministrativas" maxlength="2000" /></label>
        <fieldset class="paciente-responsables">
          <legend>Responsables asociados <span class="requisito-campo">Opcional</span></legend>
          <label>Buscar responsable por código, nombre, correo o identificador <span class="requisito-campo">Opcional</span>
            <input v-model="buscarResponsableNuevo" maxlength="80"
              @focus="tipoBusquedaResponsables !== 'nuevo' && programarBusquedaResponsables('nuevo')" />
          </label>
          <small>La búsqueda se actualiza mientras escribes.</small>
          <button v-if="sesion.tienePermiso('RESPONSABLES_GESTIONAR')" type="button"
            class="secundario" @click="abrirAltaResponsable('nuevo')">Agregar responsable</button>
          <p role="status">Responsables seleccionados: {{ nuevo.responsables.length }}</p>
          <template v-if="tipoBusquedaResponsables === 'nuevo'">
            <p v-if="buscandoResponsables" role="status">Buscando responsables…</p>
            <p v-if="errorBusquedaResponsables" class="mensaje-error" role="alert">{{ errorBusquedaResponsables }}
              <button type="button" class="secundario" @click="cargarResponsables('nuevo')">Reintentar</button>
            </p>
            <template v-else>
              <label v-for="responsable in responsablesVisibles" :key="responsable.id">
                <input v-model="nuevo.responsables" type="checkbox" :value="responsable.id" />
                {{ responsable.codigo || 'Sin código' }} · {{ responsable.nombres }} {{ responsable.apellidos }} ({{ responsable.parentesco }})
              </label>
              <p v-if="!buscandoResponsables && !responsablesVisibles.length" role="status">{{ buscarResponsableNuevo.trim() ?
                'Búsqueda sin resultados encontrados' : 'Todavía no hay responsables registrados.' }}</p>
              <button v-if="!buscandoResponsables && hayMasResponsables" type="button" class="secundario"
                @click="cargarResponsables('nuevo', true)">Cargar 100 responsables más</button>
            </template>
          </template>
        </fieldset>
        <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Registrar' }}</button>
      </form>
    </section>

    <dialog ref="dialogoResponsable" class="dialogo-responsable" aria-labelledby="titulo-alta-responsable"
      @cancel.prevent="cancelarAltaResponsable">
      <h2 id="titulo-alta-responsable">Agregar responsable</h2>
      <p>Al guardar, el responsable existirá como registro independiente aunque luego abandones el formulario del paciente. La asociación se guardará cuando registres o actualices al paciente.</p>
      <form v-if="altaResponsable" class="formulario-responsable" @submit.prevent="guardarAltaResponsable">
        <DatosResponsable v-model="altaResponsable" />
        <div class="acciones">
          <button type="submit" :disabled="guardandoResponsable">{{ guardandoResponsable ? 'Guardando…' : 'Guardar responsable' }}</button>
          <button type="button" class="secundario" :disabled="guardandoResponsable"
            @click="cancelarAltaResponsable">Cancelar</button>
        </div>
      </form>
    </dialog>

    <section class="tarjeta">
      <h2>Consultar y buscar</h2>
      <form class="formulario-grid" @submit.prevent="buscarListado">
        <label>Código, identificador, nombre, apellido o teléfono <span class="requisito-campo">Opcional</span><input v-model="buscar" maxlength="80" /></label>
        <label>Estado <span class="requisito-campo">Opcional</span>
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
                <button v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')" type="button" class="secundario" @click="editar(paciente)">Actualizar</button>
                <button v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')" type="button" class="secundario" @click="cambiarEstado(paciente)">
                  {{ paciente.estado === 'ACTIVO' ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="!pacientes.length"><td colspan="5">No hay pacientes en esta búsqueda.</td></tr>
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
      <h2>Detalle del paciente</h2>
      <p>Código: <strong>{{ detalle.codigo || 'Pendiente de asignación' }}</strong></p>
      <p><strong>{{ detalle.nombres }} {{ detalle.apellidos }}</strong> · {{ detalle.edad }} años · {{ detalle.estado }}</p>
      <p>Fecha de nacimiento: {{ formatearFecha(detalle.fechaNacimiento) }} · Sexo: {{ detalle.sexo }}</p>
      <p>Teléfono: {{ detalle.telefono }} · Dirección: {{ detalle.direccion }}</p>
      <p>Inicio del proceso: {{ formatearFecha(detalle.fechaInicioProceso) }}</p>
      <p>Observaciones administrativas: {{ detalle.observacionesAdministrativas || 'Sin observaciones' }}</p>
      <ImagenVista :valor="detalle.fotografia" alt="Fotografía del paciente" />
      <h3>Responsables</h3>
      <ul v-if="detalle.responsables.length">
        <li v-for="responsable in detalle.responsables" :key="responsable.id">
          {{ responsable.codigo || 'Sin código' }} · {{ responsable.nombres }} {{ responsable.apellidos }} ({{ responsable.parentesco }})
        </li>
      </ul>
      <p v-else>No tiene responsables asociados.</p>
      <h3>Historial de citas</h3>
      <p v-if="!sesion.tienePermiso('CITAS_VER')">No tienes permiso para consultar citas.</p>
      <ul v-else-if="historialCitas.length">
        <li v-for="cita in historialCitas" :key="cita.id">
          {{ fechaCorta(cita.fecha) }} · {{ cita.horaInicio }}–{{ cita.horaFin }} (Guatemala) ·
          {{ cita.servicio.nombre }} · {{ cita.profesional.nombre }} · {{ etiquetaEstado(cita.estado) }}
          <RouterLink :to="{ name: 'citas', query: { id: cita.id, paciente: detalle.id } }">Ver cita</RouterLink>
        </li>
      </ul>
      <p v-else>No hay citas registradas para este paciente.</p>
      <RouterLink v-if="sesion.tienePermiso('CITAS_VER') && totalCitas > 100" :to="{ name: 'citas', query: { paciente: detalle.id } }">
        Ver las {{ totalCitas }} citas y más páginas
      </RouterLink>
      <h3>Pagos</h3>
      <p>La consulta de pagos se incorporará en su fase correspondiente.</p>
    </section>

    <section v-if="edicion && sesion.tienePermiso('PACIENTES_GESTIONAR')" class="tarjeta">
      <h2>Actualizar paciente</h2>
      <form class="formulario-paciente" @submit.prevent="guardar">
        <div class="paciente-form-layout">
          <div class="paciente-form-datos">
            <h3>Datos del paciente</h3>
            <div class="paciente-campos">
              <label>Nombres <span class="requisito-campo">Obligatorio</span><input v-model.trim="edicion.nombres" required maxlength="120" /></label>
              <label>Apellidos <span class="requisito-campo">Obligatorio</span><input v-model.trim="edicion.apellidos" required maxlength="120" /></label>
              <label>Fecha de nacimiento <span class="requisito-campo">Obligatorio</span>
                <input v-model="edicion.fechaNacimiento" type="date" required :min="fechaMinimaNacimiento" :max="hoy" />
                <small>Entre {{ formatearFecha(fechaMinimaNacimiento) }} y hoy.</small>
              </label>
              <label>Sexo <span class="requisito-campo">Obligatorio</span>
                <select v-model="edicion.sexo" required>
                  <option v-for="[valor, texto] in sexos" :key="valor" :value="valor">{{ texto }}</option>
                </select>
              </label>
              <label>Teléfono <span class="requisito-campo">Obligatorio</span>
                <input :value="edicion.telefono" type="tel" inputmode="numeric" autocomplete="tel-national"
                  required minlength="8" maxlength="8" pattern="[1-9][0-9]{7}" placeholder="Ej. 55551234"
                  title="Escribe 8 números; el primero debe ser de 1 a 9" @input="capturarTelefono($event, edicion)" />
                <small>8 dígitos, sin espacios y sin iniciar con 0.</small>
              </label>
              <label>Inicio del proceso <span class="requisito-campo">Obligatorio</span>
                <input v-model="edicion.fechaInicioProceso" type="date" required :min="edicion.fechaNacimiento || undefined" :max="hoy" />
                <small>Desde el nacimiento del paciente hasta hoy.</small>
              </label>
              <label class="paciente-campo-ancho">Dirección <span class="requisito-campo">Obligatorio</span><input v-model.trim="edicion.direccion" required maxlength="300" /></label>
            </div>
          </div>
          <ImagenCampo v-model="edicion.fotografia" categoria="paciente" etiqueta="Fotografía del paciente" obligatoria mostrar-requisito proporcion="1:1" />
        </div>
        <label>Observaciones administrativas <span class="requisito-campo">Opcional</span><textarea v-model.trim="edicion.observacionesAdministrativas" maxlength="2000" /></label>
        <fieldset class="paciente-responsables">
          <legend>Responsables asociados <span class="requisito-campo">Opcional</span></legend>
          <label>Buscar responsable por código, nombre, correo o identificador <span class="requisito-campo">Opcional</span>
            <input v-model="buscarResponsableEdicion" maxlength="80"
              @focus="tipoBusquedaResponsables !== 'edicion' && programarBusquedaResponsables('edicion')" />
          </label>
          <small>La búsqueda se actualiza mientras escribes.</small>
          <button v-if="sesion.tienePermiso('RESPONSABLES_GESTIONAR')" type="button"
            class="secundario" @click="abrirAltaResponsable('edicion')">Agregar responsable</button>
          <p role="status">Responsables seleccionados: {{ edicion.responsables.length }}</p>
          <template v-if="tipoBusquedaResponsables === 'edicion'">
            <p v-if="buscandoResponsables" role="status">Buscando responsables…</p>
            <p v-if="errorBusquedaResponsables" class="mensaje-error" role="alert">{{ errorBusquedaResponsables }}
              <button type="button" class="secundario" @click="cargarResponsables('edicion')">Reintentar</button>
            </p>
            <template v-else>
              <label v-for="responsable in responsablesVisibles" :key="responsable.id">
                <input v-model="edicion.responsables" type="checkbox" :value="responsable.id" />
                {{ responsable.codigo || 'Sin código' }} · {{ responsable.nombres }} {{ responsable.apellidos }} ({{ responsable.parentesco }})
              </label>
              <p v-if="!buscandoResponsables && !responsablesVisibles.length" role="status">{{ buscarResponsableEdicion.trim() ?
                'Búsqueda sin resultados encontrados' : 'Todavía no hay responsables registrados.' }}</p>
              <button v-if="!buscandoResponsables && hayMasResponsables" type="button" class="secundario"
                @click="cargarResponsables('edicion', true)">Cargar 100 responsables más</button>
            </template>
          </template>
        </fieldset>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Guardar cambios</button>
          <button type="button" class="secundario" @click="cancelarEdicion">Cancelar</button>
        </div>
      </form>
    </section>
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
    <AdvertenciaCambios :abierto="advertenciaResponsableVisible"
      @seguir="advertenciaResponsableVisible = false" @salir="descartarAltaResponsable" />
  </main>
</template>
