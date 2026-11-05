<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import PacientesActivosSelector from '../components/PacientesActivosSelector.vue'
import ConfirmarCita from '../components/ConfirmarCita.vue'
import { avisoEspera, diasHasta, fechaMaximaGuatemala, hoyGuatemala } from '../utils/fechasCita.js'
import { mostrarError } from '../services/avisos.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'

const router = useRouter()
const sesion = useSesionStore()
const solicitudes = ref([])
const pagina = ref(0)
const hayMas = ref(false)
const servicios = ref([])
const profesionales = ref([])
const pacienteElegido = ref(null)
const detalle = ref(null)
const filtro = ref({ estado: '', buscar: '' })
const conversion = ref({ paciente: '', profesional: '', fecha: '', horaInicio: '' })
const cargando = ref(true)
const cargandoDetalle = ref(false)
const operando = ref(false)
const error = ref('')
const aviso = ref('')
const confirmacionCita = ref(null)

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
    const query = new URLSearchParams()
    if (filtro.value.estado) query.set('estado', filtro.value.estado)
    if (filtro.value.buscar.trim()) query.set('buscar', filtro.value.buscar.trim())
    if (pagina.value) query.set('pagina', String(pagina.value))
    const [datos, datosServicios] = await Promise.all([
      solicitarApi(`/api/solicitudes-cita${query.size ? `?${query}` : ''}`, { token: sesion.token }),
      solicitarApi('/api/servicios/administracion/opciones', { token: sesion.token }),
    ])
    solicitudes.value = datos.solicitudes
    hayMas.value = Boolean(datos.hayMas)
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
    profesionales.value = opciones.profesionales
    conversion.value = { paciente: '', profesional: '',
      fecha: datos.solicitud.fechaPreferida, horaInicio: '' }
  } catch (f) {
    fallo(f)
  } finally {
    cargandoDetalle.value = false
  }
}

async function actualizarProfesionales() {
  try {
    const datos = await solicitarApi('/api/solicitudes-cita/opciones',
      { token: sesion.token, silencioso: true })
    profesionales.value = datos.profesionales
    if (conversion.value.profesional &&
        !datos.profesionales.some((p) => p.id === conversion.value.profesional)) {
      conversion.value.profesional = ''
      aviso.value = 'El profesional seleccionado ya no está activo. Elige otro.'
    }
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

function convertir() {
  if (!detalle.value || operando.value || confirmacionCita.value) return
  error.value = ''
  aviso.value = ''
  if (!conversion.value.paciente || !conversion.value.profesional ||
      !conversion.value.fecha || !/^([01]\d|2[0-3]):[0-5]\d$/.test(conversion.value.horaInicio)) {
    error.value = 'Selecciona paciente, profesional, fecha y hora de inicio.'
    mostrarError(error.value, !conversion.value.paciente ? 'paciente' : 'fecha')
    return
  }
  const dias = diasHasta(conversion.value.fecha)
  if (dias === null || dias < 0 || dias > 365 ||
      (dias === 0 && conversion.value.horaInicio <= new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).format(new Date()))) {
    mostrarError('Elige una fecha y hora futuras dentro de los próximos 365 días de Guatemala.', 'fecha')
    return
  }
  confirmacionCita.value = { paciente: `${pacienteElegido.value?.codigo || 'Sin código'} · ${pacienteElegido.value?.nombre || ''}`,
    fecha: conversion.value.fecha, hora: conversion.value.horaInicio }
}

async function confirmarConversion() {
  if (!confirmacionCita.value || operando.value) return
  operando.value = true
  try {
    const datos = await solicitarApi(`/api/solicitudes-cita/${detalle.value.id}/convertir`, {
      method: 'POST', token: sesion.token, body: conversion.value,
    })
    detalle.value = (await solicitarApi(`/api/solicitudes-cita/${datos.solicitud.id}`,
      { token: sesion.token })).solicitud
    aviso.value = datos.mensaje
    confirmacionCita.value = null
    await cargar()
  } catch (f) {
    confirmacionCita.value = null
    fallo(f)
  } finally {
    operando.value = false
  }
}

onMounted(cargar)
useOpcionesVivas(actualizarProfesionales, ['usuarios'])
useOpcionesVivas(cargar, ['servicios'])
</script>

<template>
  <main class="contenedor panel-solicitudes">
    <h1>Solicitudes de citas</h1>
    <p>Una fecha preferida no reserva horario. La conversión crea una cita en estado PENDIENTE después de validar disponibilidad.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>
    <section class="tarjeta">
      <h2>Buscar solicitudes</h2>
      <form class="formulario-grid" @submit.prevent="buscarListado">
        <label>Nombre, correo o código de solicitud <span class="requisito-campo">Opcional</span><input v-model="filtro.buscar" maxlength="80" /></label>
        <label>Estado <span class="requisito-campo">Opcional</span><select v-model="filtro.estado"><option value="">Todos</option>
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
          <td>{{ item.fechaPreferida }}</td><td><span class="solicitud-estado" :class="item.estado.toLowerCase()">{{ item.estado }}</span></td>
          <td><button type="button" class="solicitud-boton-detalle" :disabled="cargandoDetalle" @click="ver(item)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>Ver detalle</button></td>
        </tr><tr v-if="!solicitudes.length"><td colspan="6">No hay solicitudes para este filtro.</td></tr></tbody>
      </table></div>
    </section>
    <nav class="acciones" aria-label="Páginas de resultados">
      <button type="button" class="secundario" :disabled="pagina === 0 || cargando" @click="moverPagina(-1)">Anterior</button>
      <span>Página {{ pagina + 1 }}</span>
      <button type="button" class="secundario" :disabled="!hayMas || cargando" @click="moverPagina(1)">Siguiente</button>
    </nav>

    <p v-if="cargandoDetalle" role="status">Cargando detalle…</p>
    <section v-if="detalle && !cargandoDetalle" class="tarjeta solicitud-detalle" :class="`solicitud-detalle--${detalle.estado.toLowerCase()}`" aria-labelledby="titulo-detalle-solicitud">
      <header class="solicitud-detalle-cabecera"><div><span class="solicitud-etiqueta">GESTIÓN DE SOLICITUDES</span>
        <h2 id="titulo-detalle-solicitud">Detalle de la solicitud</h2>
        <p>Información de contacto y datos de la atención solicitada.</p></div>
        <span class="solicitud-estado" :class="detalle.estado.toLowerCase()">{{ detalle.estado }}</span></header>
      <div class="solicitud-bloque"><h3>Datos del solicitante</h3>
        <dl class="solicitud-campos">
          <div><dt>Código de solicitud</dt><dd>{{ detalle.codigo || 'Pendiente de actualización' }}</dd></div>
          <div><dt>Nombre</dt><dd>{{ detalle.nombreSolicitante }}</dd></div>
          <div><dt>Correo electrónico</dt><dd>{{ detalle.correo }} <span class="solicitud-verificacion">{{ detalle.correoVerificado ? 'Verificado' : 'Sin verificar' }}</span></dd></div>
          <div><dt>Teléfono</dt><dd>{{ detalle.telefono }}</dd></div>
        </dl></div>
      <div class="solicitud-bloque"><h3>Información de la solicitud</h3>
        <dl class="solicitud-campos">
          <div><dt>Servicio solicitado</dt><dd>{{ nombreServicio(detalle.servicio) }}</dd></div>
          <div><dt>Fecha preferida</dt><dd>{{ detalle.fechaPreferida }}</dd><small>Esta fecha no es una cita confirmada.</small></div>
          <div class="solicitud-campo-ancho"><dt>Mensaje adicional</dt><dd class="texto-preservado">{{ detalle.mensajeAdicional || 'Sin mensaje adicional' }}</dd></div>
          <div class="solicitud-campo-ancho"><dt>Publicaciones del portal</dt><dd>{{ detalle.recibirPublicaciones ? 'El solicitante expresó interés; confirmar al registrar su contacto' : 'No solicitadas' }}</dd></div>
        </dl></div>
      <p v-if="detalle.cita"><strong>Cita relacionada:</strong>
        <RouterLink v-if="sesion.tienePermiso('CITAS_VER')"
          :to="{ name: 'citas', query: { id: detalle.cita } }">Ver detalle de la cita</RouterLink>
        <span v-else> Registrada</span></p>
      <template v-if="detalle.estado === 'PENDIENTE' && sesion.tienePermiso('SOLICITUDES_GESTIONAR')">
        <p>Para tramitarla, contacta al solicitante y confirma quién recibirá la atención. Si todavía no existe un paciente, regístralo con su fecha de nacimiento. Si es menor de edad, asocia primero un responsable. Luego selecciona paciente, profesional, fecha y hora para crear la cita pendiente; confírmala desde el módulo Citas.</p>
        <p v-if="sesion.tienePermiso('PACIENTES_GESTIONAR')"><RouterLink :to="{ name: 'pacientes' }">Ir a Pacientes para registrar o revisar datos</RouterLink></p>
        <button type="button" class="secundario" :disabled="operando" @click="rechazar">Rechazar solicitud</button>
        <h3>Convertir en cita</h3>
        <p>Selecciona un paciente ya registrado y un profesional activo. La fecha y hora efectiva pueden diferir de la fecha preferida.</p>
        <form class="formulario-grid" @submit.prevent="convertir">
          <PacientesActivosSelector v-model="conversion.paciente" endpoint="/api/solicitudes-cita/opciones"
            class="campo-ancho" @seleccion="pacienteElegido = $event" @invalido="aviso = $event" />
          <label>Profesional activo <span class="requisito-campo">Obligatorio</span>
            <select v-model="conversion.profesional" data-campo="profesional" required><option disabled value="">Selecciona un profesional</option>
            <option v-for="p in profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option></select></label>
          <label>Fecha efectiva <span class="requisito-campo">Obligatorio</span>
            <input v-model="conversion.fecha" data-campo="fecha" type="date" :min="hoyGuatemala()"
              :max="fechaMaximaGuatemala()" required />
            <small v-if="conversion.fecha" role="status">{{ avisoEspera(conversion.fecha) }}</small></label>
          <label>Hora de inicio en Guatemala <span class="requisito-campo">Obligatorio</span>
            <input v-model="conversion.horaInicio" data-campo="horaInicio" type="time" required /></label>
          <button type="submit" :disabled="operando">Revisar y continuar</button>
        </form>
        <p v-if="!profesionales.length">No hay profesionales activos. Solicita al administrador que registre uno.</p>
      </template>
    </section>
    <ConfirmarCita :datos="confirmacionCita" :ocupada="operando"
      @confirmar="confirmarConversion" @volver="confirmacionCita = null" />
  </main>
</template>

<style scoped>
.panel-solicitudes .solicitud-boton-detalle { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 14px; border: 1px solid #b9dfe1; border-radius: 9px; background: #e5f5f4; color: #087279; font-weight: 700; white-space: nowrap; }
.solicitud-boton-detalle:hover:not(:disabled) { background: #d1ecea; }
.solicitud-boton-detalle svg { width: 18px; height: 18px; }
.panel-solicitudes .solicitud-detalle { border: 1px solid #e7d79f; background: #fffbeb; }
.panel-solicitudes .solicitud-detalle--rechazada { background: #fff2f1; border-color: #ebc6c2; }
.panel-solicitudes .solicitud-detalle--atendida { background: #effaf2; border-color: #c5e4ce; }
.panel-solicitudes .solicitud-detalle--pendiente { background: #fffbeb; border-color: #e7d79f; }
.solicitud-detalle-cabecera { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 14px; margin-bottom: 20px; }
.solicitud-detalle-cabecera h2 { margin: 5px 0; }
.solicitud-detalle-cabecera p { margin: 0; color: #566c7c; }
.solicitud-etiqueta { color: #14787e; font-size: .73rem; font-weight: 800; letter-spacing: .08em; }
.solicitud-bloque { padding: 20px; margin: 14px 0; border: 1px solid rgba(101, 129, 142, .18); border-radius: 12px; background: rgba(255, 255, 255, .86); }
.solicitud-bloque h3 { margin: 0 0 16px; color: #163e60; font-size: 1.05rem; }
.solicitud-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr)); gap: 18px; margin: 0; }
.solicitud-campos div { min-width: 0; }
.solicitud-campos dt { color: #617789; font-size: .82rem; font-weight: 700; margin-bottom: 5px; }
.solicitud-campos dd { margin: 0; color: #173653; font-weight: 600; overflow-wrap: anywhere; }
.solicitud-campos small { display: block; margin-top: 5px; color: #6f6250; }
.solicitud-campo-ancho { grid-column: 1 / -1; }
.solicitud-verificacion { display: inline-block; margin: 4px; padding: 3px 8px; border-radius: 20px; background: #edf4f6; color: #405b6d; font-size: .75rem; }
.solicitud-boton-detalle:focus-visible { outline: 3px solid #d7a943; outline-offset: 3px; }
</style>
