<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PacientesActivosSelector from '../components/PacientesActivosSelector.vue'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const esAdministrador = computed(() => sesion.usuario?.rol === 'ADMINISTRADOR')
const puedeGestionar = computed(() => esAdministrador.value && sesion.tienePermiso('MATERIALES_GESTIONAR'))
const puedeAsignar = computed(() => ['ADMINISTRADOR', 'PROFESIONAL'].includes(sesion.usuario?.rol) &&
  sesion.tienePermiso('MATERIALES_ASIGNAR'))

const formularioAbierto = ref(false)
const catalogoAbierto = ref(false)
const asignacionAbierta = ref(false)
const materiales = ref([])
const pagina = ref(0)
const hayMas = ref(false)
const buscar = ref('')
const tipoFiltro = ref('')
const estadoFiltro = ref('')
const filtrosAplicados = ref({ buscar: '', tipo: '', estado: '' })
const cargando = ref(false)
const errorListado = ref('')
const detalle = ref(null)
const detalleElemento = ref(null)
let botonDetalleOrigen = null
const consultando = ref(false)
const materialElegido = ref(null)

function formularioVacio() {
  return { titulo: '', descripcion: '', tipo: '', enlace: '' }
}

const formulario = ref(formularioVacio())
const formularioOriginal = ref(JSON.stringify(formularioVacio()))
const editandoId = ref('')
const guardando = ref(false)
const cambiandoEstado = ref('')
const error = ref('')
const aviso = ref('')
const hayCambios = computed(() => puedeGestionar.value &&
  JSON.stringify(formulario.value) !== formularioOriginal.value)
const { advertenciaVisible, confirmarSalida, seguirEditando, salirSinGuardar } =
  useCambiosSinGuardar(hayCambios)

const pacienteId = ref('')
const pacienteSeleccionado = ref(null)
const historial = ref([])
const paginaHistorial = ref(0)
const hayMasHistorial = ref(false)
const cargandoHistorial = ref(false)
const errorHistorial = ref('')
const asignando = ref(false)
let versionListado = 0
let versionHistorial = 0

function fechaGuatemala(valor) {
  if (!valor) return 'Fecha no disponible'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible'
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala',
  }).format(fecha)
}

function enlaceSeguro(valor) {
  if (typeof valor !== 'string' || !valor || /[\s\\\u0000-\u001f\u007f]/.test(valor)) return ''
  if (valor.startsWith('/')) return valor.startsWith('//') ? '' : valor
  try {
    const url = new URL(valor)
    return ['http:', 'https:'].includes(url.protocol) && url.hostname &&
      !url.username && !url.password ? valor : ''
  } catch {
    return ''
  }
}

function manejarError(fallo) {
  if (fallo.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = fallo.message || 'No se pudo completar la operación'
}

async function cargarMateriales() {
  const actual = ++versionListado
  cargando.value = true
  errorListado.value = ''
  const parametros = new URLSearchParams()
  const filtros = filtrosAplicados.value
  if (filtros.buscar) parametros.set('buscar', filtros.buscar)
  if (filtros.tipo) parametros.set('tipo', filtros.tipo)
  if (esAdministrador.value && filtros.estado) parametros.set('estado', filtros.estado)
  if (pagina.value) parametros.set('pagina', String(pagina.value))
  try {
    const datos = await solicitarApi(`/api/materiales${parametros.size ? `?${parametros}` : ''}`,
      { token: sesion.token, silencioso: true })
    if (actual !== versionListado) return
    materiales.value = datos.materiales
    hayMas.value = Boolean(datos.hayMas)
  } catch (fallo) {
    if (actual !== versionListado) return
    errorListado.value = fallo.message || 'No se pudieron cargar los materiales'
    if (fallo.status === 401) manejarError(fallo)
  } finally {
    if (actual === versionListado) cargando.value = false
  }
}

async function buscarMateriales() {
  filtrosAplicados.value = {
    buscar: buscar.value.trim(), tipo: tipoFiltro.value.trim(), estado: estadoFiltro.value,
  }
  pagina.value = 0
  await cargarMateriales()
}

async function moverPagina(direccion) {
  pagina.value = Math.max(0, pagina.value + direccion)
  await cargarMateriales()
}

async function consultarMaterial(material, evento) {
  const origen = evento?.currentTarget
  consultando.value = true
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/materiales/${material.id}`,
      { token: sesion.token, silencioso: true })
    detalle.value = datos.material
    botonDetalleOrigen = origen
    await nextTick()
    detalleElemento.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    detalleElemento.value?.focus({ preventScroll: true })
  } catch (fallo) {
    manejarError(fallo)
    if ([403, 404].includes(fallo.status)) {
      detalle.value = null
      await cargarMateriales()
    }
  } finally {
    consultando.value = false
  }
}

async function cerrarDetalle() {
  detalle.value = null
  await nextTick()
  if (botonDetalleOrigen?.isConnected) {
    botonDetalleOrigen.scrollIntoView({ behavior: 'smooth', block: 'center' })
    botonDetalleOrigen.focus({ preventScroll: true })
  }
  botonDetalleOrigen = null
}

async function seleccionarMaterial(material) {
  materialElegido.value = material
  asignacionAbierta.value = true
  await nextTick()
  document.getElementById('asignacion-material')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function limpiarFormulario() {
  editandoId.value = ''
  formulario.value = formularioVacio()
  formularioOriginal.value = JSON.stringify(formulario.value)
}

async function editarMaterial(material) {
  if (hayCambios.value && !await confirmarSalida()) return
  consultando.value = true
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/materiales/${material.id}`,
      { token: sesion.token, silencioso: true })
    const actual = datos.material
    formularioAbierto.value = true
    editandoId.value = actual.id
    formulario.value = { titulo: actual.titulo, descripcion: actual.descripcion,
      tipo: actual.tipo, enlace: actual.enlace }
    formularioOriginal.value = JSON.stringify(formulario.value)
    await nextTick()
    document.getElementById('formulario-material')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (fallo) {
    manejarError(fallo)
    if (fallo.status === 404) await cargarMateriales()
  } finally {
    consultando.value = false
  }
}

async function cancelarEdicion() {
  if (hayCambios.value && !await confirmarSalida()) return
  limpiarFormulario()
}

function datosFormulario() {
  const datos = Object.fromEntries(Object.entries(formulario.value)
    .map(([campo, valor]) => [campo, valor.trim()]))
  if (!datos.titulo || datos.titulo.length > 160 || !datos.descripcion ||
      datos.descripcion.length > 4000 || !datos.tipo || datos.tipo.length > 80) {
    throw new Error('Completa título, descripción y tipo dentro de las longitudes permitidas')
  }
  if (!datos.enlace || datos.enlace.length > 500 || !enlaceSeguro(datos.enlace)) {
    throw new Error('Escribe un enlace HTTP(S) o una ruta interna válida, sin espacios ni credenciales')
  }
  return datos
}

async function guardarMaterial() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const datos = datosFormulario()
    const editando = Boolean(editandoId.value)
    const respuesta = await solicitarApi(editando ? `/api/materiales/${editandoId.value}` : '/api/materiales', {
      method: editando ? 'PUT' : 'POST', body: datos, token: sesion.token, silencioso: true,
    })
    if (detalle.value?.id === respuesta.material.id) detalle.value = respuesta.material
    if (materialElegido.value?.id === respuesta.material.id) materialElegido.value = respuesta.material
    limpiarFormulario()
    aviso.value = editando ? 'Material actualizado correctamente' : 'Material registrado correctamente'
    pagina.value = 0
    await cargarMateriales()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

async function cambiarEstado(material) {
  const estado = material.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
  if (!window.confirm(`¿Confirmas cambiar este material a ${estado}? El registro y sus asignaciones seguirán disponibles para consulta histórica.`)) return
  cambiandoEstado.value = material.id
  error.value = ''
  aviso.value = ''
  try {
    const datos = await solicitarApi(`/api/materiales/${material.id}/estado`, {
      method: 'PATCH', body: { estado }, token: sesion.token, silencioso: true,
    })
    if (detalle.value?.id === material.id) detalle.value = datos.material
    if (materialElegido.value?.id === material.id) materialElegido.value = null
    aviso.value = estado === 'ACTIVO' ? 'Material activado' : 'Material desactivado'
    await cargarMateriales()
    if (pacienteId.value) await cargarHistorial()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    cambiandoEstado.value = ''
  }
}

async function cargarHistorial() {
  const actual = ++versionHistorial
  const id = pacienteId.value
  if (!id) {
    historial.value = []
    hayMasHistorial.value = false
    errorHistorial.value = ''
    cargandoHistorial.value = false
    return
  }
  cargandoHistorial.value = true
  errorHistorial.value = ''
  const parametros = new URLSearchParams({ paciente: id, pagina: String(paginaHistorial.value) })
  try {
    const datos = await solicitarApi(`/api/asignaciones-materiales?${parametros}`,
      { token: sesion.token, silencioso: true })
    if (actual !== versionHistorial) return
    historial.value = datos.asignaciones
    hayMasHistorial.value = Boolean(datos.hayMas)
    pacienteSeleccionado.value = datos.paciente
  } catch (fallo) {
    if (actual !== versionHistorial) return
    errorHistorial.value = fallo.message || 'No se pudo consultar el historial'
    if (fallo.status === 401) manejarError(fallo)
    if ([403, 404].includes(fallo.status)) {
      error.value = errorHistorial.value
      pacienteId.value = ''
    }
  } finally {
    if (actual === versionHistorial) cargandoHistorial.value = false
  }
}

async function moverPaginaHistorial(direccion) {
  paginaHistorial.value = Math.max(0, paginaHistorial.value + direccion)
  await cargarHistorial()
}

async function asignarMaterial() {
  if (!materialElegido.value?.id || materialElegido.value.estado !== 'ACTIVO' || !pacienteId.value) {
    error.value = 'Selecciona un material activo y un paciente autorizado'
    return
  }
  asignando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi('/api/asignaciones-materiales', {
      method: 'POST', body: { material: materialElegido.value.id, paciente: pacienteId.value },
      token: sesion.token, silencioso: true,
    })
    aviso.value = 'Material asignado correctamente.'
    paginaHistorial.value = 0
    await cargarHistorial()
  } catch (fallo) {
    manejarError(fallo)
    if (fallo.status === 409) {
      materialElegido.value = null
      pacienteId.value = ''
      await cargarMateriales()
    }
    if ([403, 404].includes(fallo.status)) pacienteId.value = ''
  } finally {
    asignando.value = false
  }
}

function pacienteInvalido(mensaje) {
  error.value = mensaje
}

watch(pacienteId, () => {
  paginaHistorial.value = 0
  pacienteSeleccionado.value = null
  cargarHistorial()
})

onMounted(cargarMateriales)
</script>

<template>
  <main class="contenedor materiales-vista">
    <h1>Materiales educativos</h1>
    <p>Consulta recursos y asigna materiales a pacientes activos autorizados.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="puedeGestionar" id="formulario-material" class="tarjeta">
      <header class="seccion-plegable-cabecera"><h2>{{ editandoId ? 'Editar material' : 'Nuevo material' }}</h2><button type="button" class="secundario" :aria-expanded="formularioAbierto" aria-controls="contenido-formulario-material" @click="formularioAbierto = !formularioAbierto">{{ formularioAbierto ? 'Ocultar' : 'Mostrar' }}</button></header>
      <form v-show="formularioAbierto" id="contenido-formulario-material" class="formulario-grid" @submit.prevent="guardarMaterial">
        <label>Título <span class="requisito-campo">Obligatorio</span>
          <input v-model="formulario.titulo" required maxlength="160" autocomplete="off" />
        </label>
        <label>Tipo <span class="requisito-campo">Obligatorio</span>
          <input v-model="formulario.tipo" required maxlength="80" autocomplete="off"
            placeholder="Ej. Guía, video o artículo" />
        </label>
        <label class="campo-ancho">Descripción <span class="requisito-campo">Obligatorio</span>
          <textarea v-model="formulario.descripcion" required maxlength="4000" rows="4" />
        </label>
        <label class="campo-ancho">Enlace al recurso <span class="requisito-campo">Obligatorio</span>
          <input v-model="formulario.enlace" required maxlength="500" autocomplete="off"
            placeholder="https://ejemplo.org/recurso o /ruta-interna" />
          <small>Usa una dirección HTTP(S) o una ruta interna que empiece con /.</small>
        </label>
        <div class="acciones campo-ancho">
          <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Registrar material' }}</button>
          <button v-if="editandoId" type="button" class="secundario" @click="cancelarEdicion">Cancelar edición</button>
        </div>
      </form>
    </section>

    <section class="tarjeta" aria-labelledby="titulo-catalogo">
      <header class="seccion-plegable-cabecera"><h2 id="titulo-catalogo">Catálogo de materiales</h2><button type="button" class="secundario material-boton" :aria-expanded="catalogoAbierto" aria-controls="contenido-catalogo-material" @click="catalogoAbierto = !catalogoAbierto"><span aria-hidden="true">{{ catalogoAbierto ? '−' : '+' }}</span>{{ catalogoAbierto ? 'Ocultar' : 'Mostrar' }}</button></header>
      <div v-show="catalogoAbierto" id="contenido-catalogo-material">
      <form class="formulario-grid filtros-materiales" @submit.prevent="buscarMateriales">
        <label>Buscar por código, título o descripción
          <input v-model="buscar" type="search" maxlength="80" placeholder="MAT-0001 o palabra" />
        </label>
        <label>Tipo exacto
          <input v-model="tipoFiltro" maxlength="80" placeholder="Ej. Guía" />
        </label>
        <label v-if="esAdministrador">Estado
          <select v-model="estadoFiltro">
            <option value="">Todos</option>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </label>
        <button type="submit" class="material-boton" :disabled="cargando"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>Buscar</button>
      </form>
      <p v-if="cargando" role="status">Cargando materiales…</p>
      <p v-if="errorListado" class="mensaje-error" role="alert">{{ errorListado }}</p>
      <div v-if="!cargando && !errorListado" class="materiales-lista">
        <p v-if="!materiales.length">No hay materiales para esta búsqueda.</p>
        <article v-for="material in materiales" :key="material.id" class="material-resumen">
          <div class="material-cabecera">
            <div><h3>{{ material.titulo }}</h3><small>{{ material.tipo }} · {{ material.codigo || 'Código pendiente' }}</small></div>
            <span class="material-estado" :class="material.estado === 'ACTIVO' ? 'activo' : 'inactivo'">
              Material {{ material.estado === 'ACTIVO' ? 'activo' : 'inactivo' }}
            </span>
          </div>
          <p class="texto-preservado">{{ material.descripcion }}</p>
          <p class="material-fecha">Registrado: {{ fechaGuatemala(material.fechaRegistro) }}</p>
          <div class="acciones material-acciones">
            <a v-if="enlaceSeguro(material.enlace)" :href="enlaceSeguro(material.enlace)"
              class="material-boton material-boton-recurso" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M13 5h6v6M19 5l-9 9"/><path d="M19 13v5H5V5h5"/></svg>Abrir recurso</a>
            <span v-else>Enlace no disponible</span>
            <button type="button" class="secundario material-boton" :disabled="consultando" @click="consultarMaterial(material, $event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>Ver detalle</button>
            <button v-if="puedeAsignar && material.estado === 'ACTIVO'" type="button"
              class="material-boton" :aria-pressed="materialElegido?.id === material.id"
              @click="seleccionarMaterial(material)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 10-4M18 13v8m-4-4h8"/></svg>{{ materialElegido?.id === material.id ? 'Material seleccionado' : 'Seleccionar para asignar' }}</button>
            <button v-if="puedeGestionar" type="button" class="secundario material-boton" :disabled="consultando"
              @click="editarMaterial(material)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m4 20 4-1 11-11-3-3L5 16l-1 4ZM14 7l3 3"/></svg>Editar material</button>
            <button v-if="puedeGestionar" type="button" class="secundario material-boton"
              :disabled="Boolean(cambiandoEstado)" @click="cambiarEstado(material)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path :d="material.estado === 'ACTIVO' ? 'M8 12h8' : 'M8 12h8M12 8v8'"/></svg>
              {{ material.estado === 'ACTIVO' ? 'Desactivar' : 'Activar' }}
            </button>
          </div>
        </article>
      </div>
      <nav class="acciones material-paginas" aria-label="Páginas del catálogo">
        <button type="button" class="secundario material-boton" :disabled="pagina === 0 || cargando" @click="moverPagina(-1)"><span aria-hidden="true">←</span> Anterior</button>
        <span>Página {{ pagina + 1 }}</span>
        <button type="button" class="secundario material-boton" :disabled="!hayMas || cargando" @click="moverPagina(1)">Siguiente <span aria-hidden="true">→</span></button>
      </nav>
      </div>
    </section>

    <section v-if="detalle" ref="detalleElemento" tabindex="-1" class="tarjeta material-detalle" aria-labelledby="titulo-detalle-material">
      <div class="material-detalle-cabecera"><div><span class="material-kicker">RECURSO EDUCATIVO</span>
        <h2 id="titulo-detalle-material">Detalle del material</h2></div>
        <button type="button" class="material-cerrar" aria-label="Cerrar detalle y volver al material" @click="cerrarDetalle">×</button></div>
      <div class="material-detalle-titulo"><h3>{{ detalle.titulo }}</h3>
        <span class="material-estado" :class="detalle.estado === 'ACTIVO' ? 'activo' : 'inactivo'">{{ detalle.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}</span></div>
      <p class="material-codigo">{{ detalle.codigo || 'Código pendiente' }} · {{ detalle.tipo }}</p>
      <div class="material-descripcion"><h4>Descripción</h4><p class="texto-preservado">{{ detalle.descripcion }}</p></div>
      <dl class="material-fechas"><div><dt>Fecha de registro</dt><dd>{{ fechaGuatemala(detalle.fechaRegistro) }}</dd></div>
        <div><dt>Última actualización</dt><dd>{{ fechaGuatemala(detalle.fechaActualizacion) }}</dd></div></dl>
      <div class="acciones material-acciones">
        <a v-if="enlaceSeguro(detalle.enlace)" :href="enlaceSeguro(detalle.enlace)"
          class="material-boton material-boton-recurso" target="_blank" rel="noopener noreferrer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M13 5h6v6M19 5l-9 9M19 13v5H5V5h5"/></svg>Abrir recurso</a>
      </div>
    </section>

    <section v-if="puedeAsignar" id="asignacion-material" class="tarjeta" aria-labelledby="titulo-asignar-material">
      <header class="seccion-plegable-cabecera"><h2 id="titulo-asignar-material">Asignar materiales</h2><button type="button" class="secundario" :aria-expanded="asignacionAbierta" aria-controls="contenido-asignacion-material" @click="asignacionAbierta = !asignacionAbierta">{{ asignacionAbierta ? 'Ocultar' : 'Mostrar' }}</button></header>
      <div v-show="asignacionAbierta" id="contenido-asignacion-material">
      <p>Material seleccionado: <strong>{{ materialElegido?.titulo || 'Ninguno' }}</strong>
        <span v-if="materialElegido"> · {{ materialElegido.codigo || 'Código pendiente' }}</span></p>
      <PacientesActivosSelector v-model="pacienteId" endpoint="/api/asignaciones-materiales/opciones"
        @seleccion="pacienteSeleccionado = $event" @invalido="pacienteInvalido" />
      <p v-if="pacienteSeleccionado">Paciente: {{ pacienteSeleccionado.codigo || 'Sin código' }} · {{ pacienteSeleccionado.nombre }}</p>
      <button type="button" :disabled="asignando || !pacienteId || !materialElegido || materialElegido.estado !== 'ACTIVO'"
        @click="asignarMaterial">{{ asignando ? 'Asignando…' : 'Asignar material' }}</button>
      <p class="material-ayuda">Se permite asignar el mismo material más de una vez. Cada asignación queda registrada en el historial.</p>
      <div class="historial-asignaciones" aria-labelledby="titulo-historial-materiales">
      <h3 id="titulo-historial-materiales">Historial de asignaciones</h3>
      <p v-if="!pacienteId">Selecciona un paciente activo para consultar su historial.</p>
      <template v-else>
        <p v-if="cargandoHistorial" role="status">Cargando historial…</p>
        <p v-if="errorHistorial" class="mensaje-error" role="alert">{{ errorHistorial }}</p>
        <div v-if="!cargandoHistorial && !errorHistorial" class="materiales-lista">
          <p v-if="!historial.length">Este paciente aún no tiene asignaciones en esta página.</p>
          <article v-for="asignacion in historial" :key="asignacion.id" class="material-resumen">
            <h3>{{ asignacion.material?.titulo || 'Material ya no disponible' }}</h3>
            <p><strong>Asignado:</strong> {{ fechaGuatemala(asignacion.fechaAsignacion) }}</p>
            <p v-if="asignacion.material">
              <strong>Tipo:</strong> {{ asignacion.material.tipo }} ·
              <strong>Estado actual:</strong> {{ asignacion.material.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}
            </p>
            <p v-if="asignacion.material" class="texto-preservado">{{ asignacion.material.descripcion }}</p>
            <a v-if="enlaceSeguro(asignacion.material?.enlace)"
              :href="enlaceSeguro(asignacion.material.enlace)" target="_blank"
              rel="noopener noreferrer">Abrir recurso</a>
          </article>
        </div>
        <nav class="acciones material-paginas" aria-label="Páginas del historial">
          <button type="button" class="secundario" :disabled="paginaHistorial === 0 || cargandoHistorial"
            @click="moverPaginaHistorial(-1)">Anterior</button>
          <span>Página {{ paginaHistorial + 1 }}</span>
          <button type="button" class="secundario" :disabled="!hayMasHistorial || cargandoHistorial"
            @click="moverPaginaHistorial(1)">Siguiente</button>
        </nav>
      </template>
      </div>
      </div>
    </section>
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
  </main>
</template>

<style scoped>
.materiales-vista { min-width: 0; }
.materiales-vista .tarjeta { min-width: 0; }
.materiales-vista label { min-width: 0; }
.materiales-vista input, .materiales-vista textarea, .materiales-vista select { width: 100%; }
.materiales-vista a { display: inline-flex; align-items: center; min-height: 40px; }
.materiales-lista { display: grid; gap: 14px; margin-top: 20px; }
.material-resumen { min-width: 0; padding: 18px; border: 1px solid #d9e2ed; border-radius: 10px; }
.material-resumen h3 { margin: 0 0 5px; color: #133a5f; overflow-wrap: anywhere; }
.material-resumen p, .material-resumen small { overflow-wrap: anywhere; }
.material-cabecera { display: flex; justify-content: space-between; gap: 16px; align-items: start; }
.material-estado { flex: none; padding: 4px 9px; border-radius: 999px; font-size: .8rem; font-weight: 650; }
.material-estado.activo { color: #166044; background: #e4f3eb; }
.material-estado.inactivo { color: #79551c; background: #fff2d8; }
.material-fecha, .material-ayuda { color: #526477; font-size: .9rem; }
.material-paginas { align-items: center; margin-top: 16px; }
.material-boton { display: inline-flex; justify-content: center; align-items: center; gap: 8px; }
.material-boton svg { width: 18px; height: 18px; flex: none; stroke-linecap: round; stroke-linejoin: round; }
.materiales-vista .material-boton-recurso { padding: 10px 15px; border-radius: 8px; background: #e4f4f2; color: #076c6a; font-weight: 700; text-decoration: none; }
.materiales-vista .material-boton-recurso:hover { background: #cfeae6; }
.material-detalle { scroll-margin-top: 24px; border: 1px solid #cfe5e8; background: linear-gradient(145deg, #fff 65%, #f1f9f8); }
.material-detalle-cabecera, .material-detalle-titulo { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.material-kicker { color: #087c80; font-size: .75rem; font-weight: 800; letter-spacing: .08em; }
.material-detalle h2 { margin: 6px 0 22px; }
.material-detalle-titulo h3 { margin: 0; color: #143a5c; font-size: 1.35rem; overflow-wrap: anywhere; }
.material-cerrar { width: 40px; height: 40px; padding: 0; border: 0; border-radius: 50%; background: #e9f1f3; color: #25465b; font-size: 1.6rem; line-height: 1; }
.material-cerrar:hover { background: #d6e9e9; }
.material-codigo { color: #526b7a; }
.material-descripcion { margin: 20px 0; padding: 18px; border-radius: 10px; background: #f3f8fa; }
.material-descripcion h4 { margin: 0 0 8px; color: #153d5d; }
.material-descripcion p { margin: 0; }
.material-fechas { display: flex; flex-wrap: wrap; gap: 16px 36px; margin: 20px 0; }
.material-fechas dt { color: #60778a; font-size: .85rem; }
.material-fechas dd { margin: 5px 0 0; color: #17365d; font-weight: 700; }
.material-detalle:focus-visible, .material-boton-recurso:focus-visible, .material-cerrar:focus-visible { outline: 3px solid #d7a943; outline-offset: 3px; }
.materiales-vista .texto-preservado { white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 700px) {
  .materiales-vista .formulario-grid { grid-template-columns: 1fr; }
  .material-cabecera { flex-direction: column; }
  .material-resumen .acciones button { width: 100%; }
}
</style>
