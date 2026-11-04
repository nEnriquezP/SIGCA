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
import { crearCargaListado } from '../utils/cargaListado.js'

const router = useRouter()
const sesion = useSesionStore()
const { pacientes, total, totalPaginas, pagina, cargando, actualizando,
  cargar: cargarLista, cancelar: cancelarLista } = crearCargaListado(
  (parametros, signal) => solicitarApi(`/api/pacientes?${parametros}`, {
    token: sesion.token, signal, silencioso: true,
  }), (errorApi, cargado) => {
    if (errorApi.status === 401 || !cargado) fallo(errorApi)
    else error.value = errorApi.message || 'No se pudo actualizar el listado'
  })
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
const orden = ref('codigo_asc')
const error = ref('')
const aviso = ref('')
const menuAbierto = ref('')
const indiceResponsable = ref(0)
const guardando = ref(false)
const edicion = ref(null)
const edicionOriginal = ref(null)
const detalle = ref(null)
const registroAbierto = ref(false)
const busquedaAbierta = ref(true)
const reenviandoCorreo = ref(false)
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
const responsableActual = computed(() => detalle.value?.responsables?.[indiceResponsable.value] ?? null)
const { advertenciaVisible, confirmarSalida, seguirEditando, salirSinGuardar } =
  useCambiosSinGuardar(hayCambios)

function vacio() {
  return { fotografia: '', nombres: '', apellidos: '', fechaNacimiento: '', sexo: '',
    telefono: '', correo: '', recibirPublicaciones: false, direccion: '', fechaInicioProceso: '', observacionesAdministrativas: '',
    responsables: [] }
}

function responsableVacio() {
  return { fotografia: '', nombres: '', apellidos: '', parentesco: '', telefono: '',
    correo: '', direccion: '', recibirPublicaciones: false }
}

async function abrirAltaResponsable(destino) {
  if (!sesion.tienePermiso('RESPONSABLES_GESTIONAR') || altaResponsable.value) return
  if ((destino === 'edicion' ? edicion.value : nuevo.value).responsables.length >= 5) {
    return fallo(new Error('Un paciente puede tener como máximo cinco responsables'))
  }
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
  if ((destinoResponsable.value === 'edicion' ? edicion.value : nuevo.value).responsables.length >= 5) {
    return fallo(new Error('Un paciente puede tener como máximo cinco responsables'))
  }
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

function edadCalculada(fechaNacimiento) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento) || fechaNacimiento > hoy) return null
  const [anio, mes, dia] = fechaNacimiento.split('-').map(Number)
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null
  let edad = Number(hoy.slice(0, 4)) - anio
  if (hoy.slice(5) < fechaNacimiento.slice(5)) edad--
  return edad
}

function requiereResponsable(fechaNacimiento) {
  const edad = edadCalculada(fechaNacimiento)
  return edad !== null && edad < 18
}

async function reenviarCorreoPaciente() {
  if (!detalle.value?.id || reenviandoCorreo.value) return
  reenviandoCorreo.value = true
  try {
    const respuesta = await solicitarApi('/api/correo/reenviar', {
      method: 'POST', token: sesion.token, body: { tipo: 'PACIENTE', id: detalle.value.id },
    })
    aviso.value = respuesta.mensaje
  } catch (errorApi) { fallo(errorApi) } finally { reenviandoCorreo.value = false }
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

async function limpiarFiltros() {
  buscar.value = ''
  estadoFiltro.value = ''
  orden.value = 'codigo_asc'
  pagina.value = 0
  await cargar()
}

async function moverPagina(destino) {
  pagina.value = Math.min(Math.max(0, destino), totalPaginas.value - 1)
  await cargar()
}

async function cargar(forzar = false) {
  error.value = ''
  const parametros = new URLSearchParams({ orden: orden.value, pagina: String(pagina.value) })
  if (buscar.value.trim()) parametros.set('buscar', buscar.value.trim())
  if (estadoFiltro.value) parametros.set('estado', estadoFiltro.value)
  await cargarLista(parametros, forzar)
}

function cerrarMenu() { menuAbierto.value = '' }

async function abrirMenu(paciente, evento) {
  const contenedor = evento.currentTarget.parentElement
  menuAbierto.value = menuAbierto.value === paciente.id ? '' : paciente.id
  if (menuAbierto.value) {
    await nextTick()
    contenedor.querySelector('.menu-acciones button')?.focus()
  }
}

function pulsacionGlobal(evento) {
  if (evento.key !== 'Escape' || !menuAbierto.value) return
  const boton = document.querySelector('[data-acciones-paciente] [aria-expanded="true"]')
  cerrarMenu()
  boton?.focus()
}

function clicGlobal(evento) {
  if (!evento.target.closest('[data-acciones-paciente]')) cerrarMenu()
}

function tecladoMenu(evento) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(evento.key)) return
  const opciones = [...evento.currentTarget.querySelectorAll('.menu-acciones button')]
  if (!opciones.length) return
  evento.preventDefault()
  const actual = opciones.indexOf(document.activeElement)
  const indice = evento.key === 'Home' ? 0 : evento.key === 'End' ? opciones.length - 1 :
    (actual + (evento.key === 'ArrowDown' ? 1 : -1) + opciones.length) % opciones.length
  opciones[indice].focus()
}

function salirMenu(evento) {
  if (!evento.currentTarget.contains(evento.relatedTarget)) cerrarMenu()
}

function moverResponsable(direccion) {
  const cantidad = detalle.value?.responsables?.length ?? 0
  if (cantidad) indiceResponsable.value = (indiceResponsable.value + direccion + cantidad) % cantidad
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
  if (nuevo.value.responsables.length > 5) return fallo(new Error('Un paciente puede tener como máximo cinco responsables'))
  if (requiereResponsable(nuevo.value.fechaNacimiento) && !nuevo.value.responsables.length) return fallo(new Error('Asocia al menos un responsable al paciente menor de 18 años'))
  if (!nuevo.value.fotografia) return fallo(new Error('Carga una fotografía del paciente'))
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const respuesta = await solicitarApi('/api/pacientes', { method: 'POST', token: sesion.token, body: nuevo.value })
    nuevo.value = vacio()
    buscarResponsableNuevo.value = ''
    aviso.value = respuesta.mensaje || 'Paciente registrado'
    await cargar(true)
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
    indiceResponsable.value = 0
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
  if (edicion.value.responsables.length > 5) return fallo(new Error('Un paciente puede tener como máximo cinco responsables'))
  if (requiereResponsable(edicion.value.fechaNacimiento) && !edicion.value.responsables.length) return fallo(new Error('Asocia al menos un responsable al paciente menor de 18 años'))
  if (!edicion.value.fotografia) return fallo(new Error('Carga una fotografía del paciente'))
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { id, codigo, edad, estado, correoVerificado, createdAt, updatedAt, ...datos } = edicion.value
    const respuesta = await solicitarApi(`/api/pacientes/${id}`, { method: 'PUT', token: sesion.token, body: datos })
    edicion.value = null
    edicionOriginal.value = null
    buscarResponsableEdicion.value = ''
    cargarResponsables('nuevo')
    aviso.value = respuesta.mensaje || 'Paciente actualizado'
    await cargar(true)
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
    await cargar(true)
  } catch (errorApi) {
    fallo(errorApi)
  }
}

useOpcionesVivas(() => {
  if (sesion.tienePermiso('RESPONSABLES_VER')) {
    cargarResponsables(edicion.value ? 'edicion' : 'nuevo')
  }
}, ['responsables'])
useOpcionesVivas(cargar)

onMounted(async () => {
  document.addEventListener('keydown', pulsacionGlobal)
  document.addEventListener('pointerdown', clicGlobal)
  await Promise.all([cargar(), sesion.tienePermiso('RESPONSABLES_VER') ? cargarResponsables() : Promise.resolve()])
})

onUnmounted(() => {
  cancelarLista()
  document.removeEventListener('keydown', pulsacionGlobal)
  document.removeEventListener('pointerdown', clicGlobal)
})
</script>

<template>
  <main class="contenedor">
    <h1>Pacientes</h1>
    <p>Puedes seleccionar un responsable existente o agregarlo aquí sin perder los datos del paciente.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')" class="tarjeta">
      <header class="seccion-plegable-cabecera"><h2>Registrar paciente</h2>
        <button type="button" class="secundario" :aria-expanded="registroAbierto" aria-controls="formulario-registro-paciente"
          @click="registroAbierto = !registroAbierto">{{ registroAbierto ? 'Ocultar' : 'Mostrar' }}</button></header>
      <form v-show="registroAbierto" id="formulario-registro-paciente" class="formulario-paciente" @submit.prevent="crear">
        <div class="paciente-form-layout">
          <div class="paciente-form-datos">
            <h3>Datos del paciente</h3>
            <div class="paciente-campos">
              <label>Nombres <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.nombres" required maxlength="120" /></label>
              <label>Apellidos <span class="requisito-campo">Obligatorio</span><input v-model.trim="nuevo.apellidos" required maxlength="120" /></label>
              <label>Fecha de nacimiento <span class="requisito-campo">Obligatorio</span>
                <input v-model="nuevo.fechaNacimiento" type="date" required :min="fechaMinimaNacimiento" :max="hoy" />
                <small>Entre {{ formatearFecha(fechaMinimaNacimiento) }} y hoy. <span v-if="edadCalculada(nuevo.fechaNacimiento) !== null">Edad: {{ edadCalculada(nuevo.fechaNacimiento) }} años.</span></small>
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
              <label>Correo electrónico <span class="requisito-campo">Opcional</span>
                <input v-model.trim="nuevo.correo" type="email" maxlength="254" placeholder="usuario@dominio.com" />
                <small>Si lo agregas, enviaremos un enlace de verificación.</small>
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
        <label><input v-model="nuevo.recibirPublicaciones" type="checkbox" :disabled="!nuevo.correo" /> Recibir publicaciones por correo después de verificarlo (opcional)</label>
        <fieldset class="paciente-responsables">
          <legend>Responsables asociados <span class="requisito-campo">{{ requiereResponsable(nuevo.fechaNacimiento) ? 'Obligatorio para menores de 18 años' : 'Opcional para adultos' }}</span></legend>
          <label>Buscar responsable por código, nombre, correo o identificador <span class="requisito-campo">Opcional</span>
            <input v-model="buscarResponsableNuevo" maxlength="80"
              @focus="tipoBusquedaResponsables !== 'nuevo' && programarBusquedaResponsables('nuevo')" />
          </label>
          <small>La búsqueda se actualiza mientras escribes. Máximo cinco responsables.</small>
          <button v-if="sesion.tienePermiso('RESPONSABLES_GESTIONAR')" type="button"
            class="secundario" :disabled="nuevo.responsables.length >= 5"
            @click="abrirAltaResponsable('nuevo')">Agregar responsable</button>
          <p role="status">Responsables seleccionados: {{ nuevo.responsables.length }} de 5</p>
          <template v-if="tipoBusquedaResponsables === 'nuevo'">
            <p v-if="buscandoResponsables" role="status">Buscando responsables…</p>
            <p v-if="errorBusquedaResponsables" class="mensaje-error" role="alert">{{ errorBusquedaResponsables }}
              <button type="button" class="secundario" @click="cargarResponsables('nuevo')">Reintentar</button>
            </p>
            <template v-else>
              <label v-for="responsable in responsablesVisibles" :key="responsable.id">
                <input v-model="nuevo.responsables" type="checkbox" :value="responsable.id"
                  :disabled="nuevo.responsables.length >= 5 && !nuevo.responsables.includes(responsable.id)" />
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
      <header class="seccion-plegable-cabecera"><h2>Consultar y buscar</h2>
        <button type="button" class="secundario" :aria-expanded="busquedaAbierta" aria-controls="listado-pacientes"
          @click="busquedaAbierta = !busquedaAbierta">{{ busquedaAbierta ? 'Ocultar' : 'Mostrar' }}</button></header>
      <div v-show="busquedaAbierta" id="listado-pacientes">
      <form class="formulario-grid filtros-pacientes" @submit.prevent="buscarListado">
        <label>Código, identificador, nombre, apellido o teléfono <span class="requisito-campo">Opcional</span><input v-model="buscar" maxlength="80" /></label>
        <label>Estado <span class="requisito-campo">Opcional</span>
          <select v-model="estadoFiltro">
            <option value="">Todos</option><option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </label>
        <label>Orden
          <select v-model="orden" @change="buscarListado">
            <option value="codigo_asc">Código ascendente</option>
            <option value="codigo_desc">Código descendente</option>
            <option value="alfabetico_asc">Nombre A–Z</option>
            <option value="alfabetico_desc">Nombre Z–A</option>
            <option value="ultimos_10">Últimos 10 registrados</option>
          </select>
        </label>
        <button type="submit">Buscar</button>
        <button type="button" class="secundario" @click="limpiarFiltros">Limpiar filtros</button>
      </form>
      <p v-if="cargando" role="status">Cargando pacientes…</p>
      <p v-if="actualizando" class="pacientes-actualizando" role="status">Actualizando listado…</p>
      <p v-if="!cargando" class="pacientes-total" role="status">{{ orden === 'ultimos_10' ? `Mostrando los últimos ${pacientes.length} de ${total} resultados` : `${total} resultados · Página ${pagina + 1} de ${totalPaginas}` }}</p>
      <div v-if="!cargando" class="tabla-contenedor">
        <table>
          <thead><tr><th>Código</th><th>Nombre</th><th>Edad</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="paciente in pacientes" :key="paciente.id">
              <td>{{ paciente.codigo || 'Pendiente de asignación' }}</td>
              <td>{{ paciente.nombres }} {{ paciente.apellidos }}</td>
              <td>{{ paciente.edad }}</td>
              <td>{{ paciente.estado }}</td>
              <td>
                <div class="acciones-paciente" data-acciones-paciente
                  @keydown="tecladoMenu" @focusout="salirMenu">
                  <button type="button" class="secundario" :aria-expanded="menuAbierto === paciente.id"
                    aria-haspopup="menu" @click="abrirMenu(paciente, $event)">Acciones</button>
                  <div v-if="menuAbierto === paciente.id" class="menu-acciones" role="menu">
                    <button type="button" role="menuitem" @click="cerrarMenu(); consultar(paciente)">Ver</button>
                    <button v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')" type="button" role="menuitem"
                      @click="cerrarMenu(); editar(paciente)">Actualizar</button>
                    <button v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')" type="button" role="menuitem"
                      @click="cerrarMenu(); cambiarEstado(paciente)">
                      {{ paciente.estado === 'ACTIVO' ? 'Desactivar' : 'Activar' }}
                    </button>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-if="!pacientes.length"><td colspan="5">No hay pacientes en esta búsqueda.</td></tr>
          </tbody>
        </table>
      </div>
      </div>
    </section>

    <nav v-if="busquedaAbierta && orden !== 'ultimos_10'" class="acciones paginacion-pacientes" aria-label="Páginas de resultados">
      <button type="button" class="secundario" :disabled="pagina === 0 || cargando" @click="moverPagina(0)">Primera</button>
      <button type="button" class="secundario" :disabled="pagina === 0 || cargando" @click="moverPagina(pagina - 1)">Anterior</button>
      <span>Página {{ pagina + 1 }} de {{ totalPaginas }}</span>
      <button type="button" class="secundario" :disabled="pagina + 1 >= totalPaginas || cargando" @click="moverPagina(pagina + 1)">Siguiente</button>
      <button type="button" class="secundario" :disabled="pagina + 1 >= totalPaginas || cargando" @click="moverPagina(totalPaginas - 1)">Última</button>
    </nav>

    <section v-if="detalle" class="tarjeta detalle-paciente">
      <header class="detalle-paciente-cabecera">
        <div>
          <p class="detalle-paciente-etiqueta">Detalle del paciente</p>
          <h2>{{ detalle.nombres }} {{ detalle.apellidos }}</h2>
          <p><strong>{{ detalle.codigo || 'Pendiente de asignación' }}</strong></p>
        </div>
        <div class="acciones"><span class="detalle-paciente-estado" :class="detalle.estado === 'ACTIVO' ? 'estado-activo' : 'estado-inactivo'">{{ detalle.estado }}</span>
          <button type="button" class="secundario" aria-label="Cerrar detalle del paciente" @click="detalle = null">×</button></div>
      </header>
      <div class="detalle-paciente-secciones">
        <section class="detalle-paciente-bloque">
          <h3>Información personal</h3>
          <dl class="detalle-paciente-datos">
            <div><dt>Edad</dt><dd>{{ detalle.edad }} años</dd></div>
            <div><dt>Fecha de nacimiento</dt><dd>{{ formatearFecha(detalle.fechaNacimiento) }}</dd></div>
            <div><dt>Sexo</dt><dd>{{ detalle.sexo }}</dd></div>
          </dl>
        </section>
        <section class="detalle-paciente-bloque">
          <h3>Contacto y proceso</h3>
          <dl class="detalle-paciente-datos">
            <div><dt>Teléfono</dt><dd>{{ detalle.telefono }}</dd></div>
            <div><dt>Correo electrónico</dt><dd>{{ detalle.correo || 'No registrado' }}
              <small v-if="detalle.correo"> · {{ detalle.correoVerificado ? 'Verificado' : 'Pendiente de verificación' }}</small></dd></div>
            <div><dt>Dirección</dt><dd>{{ detalle.direccion }}</dd></div>
            <div><dt>Inicio del proceso</dt><dd>{{ formatearFecha(detalle.fechaInicioProceso) }}</dd></div>
          </dl>
          <button v-if="sesion.usuario?.rol === 'ADMINISTRADOR' && detalle.correo && !detalle.correoVerificado"
            type="button" class="secundario" :disabled="reenviandoCorreo" @click="reenviarCorreoPaciente">
            {{ reenviandoCorreo ? 'Enviando…' : 'Reenviar verificación' }}</button>
        </section>
      </div>
      <section class="detalle-paciente-bloque">
        <h3>Observaciones administrativas</h3>
        <p>{{ detalle.observacionesAdministrativas || 'Sin observaciones' }}</p>
      </section>
      <div class="detalle-paciente-fotos">
        <section class="detalle-paciente-foto">
          <h3>Fotografía del paciente</h3>
          <ImagenVista :valor="detalle.fotografia" alt="Fotografía del paciente" silueta />
          <p>{{ detalle.nombres }} {{ detalle.apellidos }}</p>
        </section>
        <section class="detalle-paciente-foto">
          <h3>Responsables asociados</h3>
          <template v-if="responsableActual">
            <ImagenVista :key="responsableActual.id" :valor="responsableActual.fotografia || ''"
              :alt="`Fotografía de ${responsableActual.nombres} ${responsableActual.apellidos}`" silueta />
            <p><strong>{{ responsableActual.nombres }} {{ responsableActual.apellidos }}</strong></p>
            <p>{{ responsableActual.codigo || 'Sin código' }} · {{ responsableActual.parentesco }}</p>
            <div v-if="detalle.responsables.length > 1" class="detalle-paciente-carrusel">
              <button type="button" class="secundario" @click="moverResponsable(-1)">Anterior</button>
              <span role="status">{{ indiceResponsable + 1 }} de {{ detalle.responsables.length }}</span>
              <button type="button" class="secundario" @click="moverResponsable(1)">Siguiente</button>
            </div>
          </template>
          <p v-else>{{ detalle.edad < 18 ? 'Menor registrado sin responsable. Asocia uno al actualizar este paciente.' : 'No tiene responsables asociados.' }}</p>
        </section>
      </div>
      <section class="detalle-paciente-bloque">
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
      </section>
      <section class="detalle-paciente-bloque">
      <h3>Pagos</h3>
      <RouterLink v-if="sesion.tienePermiso('PAGOS_VER')"
        :to="{ name: 'pagos', query: { paciente: detalle.id } }">
        Ver pagos y saldos del paciente
      </RouterLink>
      <p v-else>No tienes permiso para consultar pagos.</p>
      </section>
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
                <small>Entre {{ formatearFecha(fechaMinimaNacimiento) }} y hoy. <span v-if="edadCalculada(edicion.fechaNacimiento) !== null">Edad: {{ edadCalculada(edicion.fechaNacimiento) }} años.</span></small>
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
              <label>Correo electrónico <span class="requisito-campo">Opcional</span>
                <input v-model.trim="edicion.correo" type="email" maxlength="254" placeholder="usuario@dominio.com" />
                <small>{{ edicion.correoVerificado ? 'Correo verificado' : 'Pendiente de verificación' }}</small>
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
        <label><input v-model="edicion.recibirPublicaciones" type="checkbox" :disabled="!edicion.correo" /> Recibir publicaciones por correo después de verificarlo (opcional)</label>
        <fieldset class="paciente-responsables">
          <legend>Responsables asociados <span class="requisito-campo">{{ requiereResponsable(edicion.fechaNacimiento) ? 'Obligatorio para menores de 18 años' : 'Opcional para adultos' }}</span></legend>
          <label>Buscar responsable por código, nombre, correo o identificador <span class="requisito-campo">Opcional</span>
            <input v-model="buscarResponsableEdicion" maxlength="80"
              @focus="tipoBusquedaResponsables !== 'edicion' && programarBusquedaResponsables('edicion')" />
          </label>
          <small>La búsqueda se actualiza mientras escribes. Máximo cinco responsables.</small>
          <button v-if="sesion.tienePermiso('RESPONSABLES_GESTIONAR')" type="button"
            class="secundario" :disabled="edicion.responsables.length >= 5"
            @click="abrirAltaResponsable('edicion')">Agregar responsable</button>
          <p role="status">Responsables seleccionados: {{ edicion.responsables.length }} de 5</p>
          <template v-if="tipoBusquedaResponsables === 'edicion'">
            <p v-if="buscandoResponsables" role="status">Buscando responsables…</p>
            <p v-if="errorBusquedaResponsables" class="mensaje-error" role="alert">{{ errorBusquedaResponsables }}
              <button type="button" class="secundario" @click="cargarResponsables('edicion')">Reintentar</button>
            </p>
            <template v-else>
              <label v-for="responsable in responsablesVisibles" :key="responsable.id">
                <input v-model="edicion.responsables" type="checkbox" :value="responsable.id"
                  :disabled="edicion.responsables.length >= 5 && !edicion.responsables.includes(responsable.id)" />
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
