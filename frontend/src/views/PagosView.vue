<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { usePagosStore } from '../stores/pagos.js'
import { fechaCorta, fechaHoraGuatemala } from '../utils/formatoCita.js'
import { entradaQuetzales, leerQuetzales, quetzales } from '../utils/dinero.js'

const route = useRoute()
const router = useRouter()
const sesion = useSesionStore()
const intentos = usePagosStore()
const esAdministrador = computed(() => sesion.usuario?.rol === 'ADMINISTRADOR')
const puedeRegistrar = computed(() => sesion.tienePermiso('PAGOS_REGISTRAR'))
const puedeAnular = computed(() => esAdministrador.value && sesion.tienePermiso('PAGOS_ANULAR'))

const caja = ref(null)
const cierre = ref(null)
const montoInicial = ref('0.00')
const efectivoContado = ref('')
const pagos = ref([])
const total = ref(0)
const pagina = ref(0)
const filtros = ref({ paciente: String(route.query.paciente || ''), fecha: '', metodo: '' })
const nombrePaciente = ref('')
const textoPaciente = ref('')
const resultadosPaciente = ref([])
const citas = ref([])
const citaId = ref(String(route.query.cita || ''))
const cita = ref(null)
const saldo = ref(null)
const historial = ref([])
const totalHistorial = ref(0)
const paginaHistorial = ref(0)
const monto = ref('')
const metodo = ref('EFECTIVO')
const comprobante = ref(null)
const pagoDetalle = ref(null)
const motivo = ref('')
const ocupado = ref(false)
const cargando = ref(false)
const error = ref('')
const aviso = ref('')

const hayMas = computed(() => (pagina.value + 1) * 50 < total.value)
const hayMasHistorial = computed(() => (paginaHistorial.value + 1) * 50 < totalHistorial.value)
const reintentoDisponible = computed(() => {
  const centavos = leerQuetzales(monto.value)
  return centavos !== null && cita.value && intentos.coincide(
    sesion.usuario?.id, cita.value.id, centavos, metodo.value)
})

function explicarError(fallo) {
  if (fallo.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
    return
  }
  const inicio = { 400: 'Revisa los datos ingresados', 403: 'No tienes permiso para esta operación',
    404: 'El registro ya no está disponible', 409: 'Los datos cambiaron o existe un conflicto' }[fallo.status]
  error.value = inicio ? `${inicio}. ${fallo.message}` :
    (fallo.message || 'No se pudo completar la operación')
}

async function cargarCaja() {
  try {
    caja.value = (await solicitarApi('/api/cajas/actual', {
      token: sesion.token, silencioso: true })).caja
  } catch (fallo) { explicarError(fallo) }
}

async function abrirCaja() {
  const centavos = leerQuetzales(montoInicial.value, { admiteCero: true })
  if (centavos === null) { error.value = 'Escribe un monto inicial válido con hasta dos decimales.'; return }
  if (!window.confirm(`¿Abrir tu caja con ${quetzales(centavos)}?`)) return
  ocupado.value = true; error.value = ''; aviso.value = ''
  try {
    caja.value = (await solicitarApi('/api/cajas/abrir', { method: 'POST',
      token: sesion.token, body: { montoInicialCentavos: centavos }, silencioso: true })).caja
    cierre.value = null
    aviso.value = 'Caja propia abierta.'
  } catch (fallo) { explicarError(fallo); await cargarCaja() } finally { ocupado.value = false }
}

async function cerrarCaja() {
  const centavos = leerQuetzales(efectivoContado.value, { admiteCero: true })
  if (!caja.value || centavos === null) {
    error.value = 'Escribe el efectivo contado con hasta dos decimales.'
    return
  }
  if (!window.confirm(`¿Cerrar tu caja con ${quetzales(centavos)} contados? Después no aceptará movimientos.`)) return
  ocupado.value = true; error.value = ''; aviso.value = ''
  try {
    cierre.value = (await solicitarApi(`/api/cajas/${caja.value.id}/cerrar`, {
      method: 'POST', token: sesion.token,
      body: { efectivoContadoCentavos: centavos }, silencioso: true })).caja
    caja.value = null
    aviso.value = 'Caja cerrada. Se conservaron los movimientos y totales.'
  } catch (fallo) { explicarError(fallo); await cargarCaja() } finally { ocupado.value = false }
}

async function cargarPagos() {
  cargando.value = true
  const parametros = new URLSearchParams({ pagina: String(pagina.value) })
  for (const [campo, valor] of Object.entries(filtros.value)) {
    if (valor) parametros.set(campo, valor)
  }
  try {
    const datos = await solicitarApi(`/api/pagos?${parametros}`, {
      token: sesion.token, silencioso: true })
    pagos.value = datos.pagos
    total.value = datos.total
  } catch (fallo) { explicarError(fallo) } finally { cargando.value = false }
}

async function cargarCitas() {
  const parametros = new URLSearchParams({ pagina: '0' })
  if (filtros.value.paciente) parametros.set('paciente', filtros.value.paciente)
  try {
    citas.value = (await solicitarApi(`/api/citas?${parametros}`, {
      token: sesion.token, silencioso: true })).citas
  } catch (fallo) { explicarError(fallo) }
}

async function buscarPacientes() {
  const texto = textoPaciente.value.trim()
  if (!texto) { resultadosPaciente.value = []; return }
  try {
    resultadosPaciente.value = (await solicitarApi(
      `/api/pacientes?buscar=${encodeURIComponent(texto)}`, {
        token: sesion.token, silencioso: true })).pacientes.slice(0, 10)
  } catch (fallo) { explicarError(fallo) }
}

async function elegirPaciente(paciente) {
  filtros.value.paciente = paciente.id
  nombrePaciente.value = `${paciente.codigo || 'Sin código'} · ${paciente.nombres} ${paciente.apellidos}`
  resultadosPaciente.value = []
  pagina.value = 0
  await Promise.all([cargarPagos(), cargarCitas()])
}

async function quitarPaciente() {
  filtros.value.paciente = ''
  nombrePaciente.value = ''
  textoPaciente.value = ''
  pagina.value = 0
  await Promise.all([cargarPagos(), cargarCitas()])
}

async function filtrar() { pagina.value = 0; await cargarPagos() }
async function cambiarPagina(direccion) {
  pagina.value = Math.max(0, pagina.value + direccion)
  await cargarPagos()
}

async function cargarHistorial() {
  if (!cita.value) return
  try {
    const datos = await solicitarApi(`/api/citas/${cita.value.id}/pagos?pagina=${paginaHistorial.value}`, {
      token: sesion.token, silencioso: true })
    historial.value = datos.pagos
    totalHistorial.value = datos.total
  } catch (fallo) { explicarError(fallo) }
}

async function seleccionarCita(id) {
  if (!id) { cita.value = null; saldo.value = null; historial.value = []; return }
  error.value = ''
  try {
    if (cita.value?.id !== id) { comprobante.value = null; pagoDetalle.value = null }
    cita.value = (await solicitarApi(`/api/citas/${id}`, {
      token: sesion.token, silencioso: true })).cita
    citaId.value = cita.value.id
    if (!citas.value.some((item) => item.id === cita.value.id)) citas.value.unshift(cita.value)
    if (intentos.intento?.usuario === sesion.usuario?.id &&
        intentos.intento.cita === cita.value.id) {
      monto.value = entradaQuetzales(intentos.intento.montoCentavos)
      metodo.value = intentos.intento.metodo
    }
    paginaHistorial.value = 0
    const [saldos, registros] = await Promise.all([
      solicitarApi(`/api/citas/${id}/saldo`, { token: sesion.token, silencioso: true }),
      solicitarApi(`/api/citas/${id}/pagos?pagina=0`, { token: sesion.token, silencioso: true }),
    ])
    saldo.value = saldos.saldo
    historial.value = registros.pagos
    totalHistorial.value = registros.total
  } catch (fallo) {
    cita.value = null; saldo.value = null; historial.value = []
    explicarError(fallo)
  }
}

async function refrescarCita() {
  if (!cita.value) return
  await seleccionarCita(cita.value.id)
}

async function registrarPago() {
  if (ocupado.value || !cita.value || !saldo.value || !caja.value) return
  const montoCentavos = leerQuetzales(monto.value)
  const repeticion = montoCentavos !== null && intentos.coincide(
    sesion.usuario.id, cita.value.id, montoCentavos, metodo.value)
  if (montoCentavos === null || (montoCentavos > saldo.value.saldoPendienteCentavos && !repeticion)) {
    error.value = 'El monto debe ser positivo, tener hasta dos decimales y no superar el saldo.'
    return
  }
  if (!window.confirm(`¿Registrar ${quetzales(montoCentavos)} por ${metodo.value} para esta cita?`)) return
  const solicitudId = intentos.solicitudPara(sesion.usuario.id, cita.value.id, montoCentavos, metodo.value)
  ocupado.value = true; error.value = ''; aviso.value = ''
  try {
    const datos = await solicitarApi('/api/pagos', { method: 'POST', token: sesion.token,
      body: { cita: cita.value.id, montoCentavos, metodo: metodo.value, solicitudId },
      silencioso: true })
    comprobante.value = datos.pago
    intentos.limpiar()
    monto.value = ''
    aviso.value = datos.repetido ? 'El pago ya estaba registrado; no se creó otro cobro.' :
      'Pago registrado. Conserva el número de comprobante interno.'
    await Promise.all([cargarPagos(), refrescarCita(), cargarCaja()])
  } catch (fallo) { explicarError(fallo) } finally { ocupado.value = false }
}

async function consultarPago(id) {
  try {
    pagoDetalle.value = (await solicitarApi(`/api/pagos/${id}`, {
      token: sesion.token, silencioso: true })).pago
    motivo.value = ''
  } catch (fallo) { explicarError(fallo) }
}

async function anularPago() {
  if (!puedeAnular.value || !pagoDetalle.value || !motivo.value.trim() || ocupado.value) return
  if (!window.confirm(`¿Anular el pago ${pagoDetalle.value.numeroComprobante}? El registro permanecerá en el historial.`)) return
  ocupado.value = true; error.value = ''; aviso.value = ''
  try {
    pagoDetalle.value = (await solicitarApi(`/api/pagos/${pagoDetalle.value.id}/anular`, {
      method: 'PATCH', token: sesion.token,
      body: { motivo: motivo.value.trim() }, silencioso: true })).pago
    motivo.value = ''
    aviso.value = 'Pago anulado. El saldo y los totales de la caja abierta se actualizaron.'
    await Promise.all([cargarPagos(), refrescarCita(), cargarCaja()])
  } catch (fallo) { explicarError(fallo) } finally { ocupado.value = false }
}

async function cargarPacienteRuta(id) {
  if (!id) return
  try {
    const paciente = (await solicitarApi(`/api/pacientes/${id}`, {
      token: sesion.token, silencioso: true })).paciente
    nombrePaciente.value = `${paciente.codigo || 'Sin código'} · ${paciente.nombres} ${paciente.apellidos}`
  } catch (fallo) { explicarError(fallo) }
}

watch(() => route.query.cita, (id) => { if (id) seleccionarCita(String(id)) })
watch(() => route.query.paciente, async (id) => {
  filtros.value.paciente = String(id || '')
  nombrePaciente.value = ''
  pagina.value = 0
  await Promise.all([cargarPacienteRuta(filtros.value.paciente), cargarPagos(), cargarCitas()])
})

onMounted(async () => {
  await Promise.all([cargarCaja(), cargarPagos(), cargarCitas(),
    cargarPacienteRuta(filtros.value.paciente)])
  if (citaId.value) await seleccionarCita(citaId.value)
})
</script>

<template>
  <main class="contenedor pagos-vista">
    <h1>Pagos y saldos</h1>
    <p>Los importes se muestran en quetzales. El comprobante es interno y no sustituye una factura tributaria.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section class="tarjeta">
      <h2>Mi caja</h2>
      <p><RouterLink :to="{ name: 'caja', query: caja?.id || cierre?.id ?
        { id: caja?.id || cierre?.id } : {} }">
        Consultar resumen, movimientos y cierres de caja</RouterLink></p>
      <p v-if="caja">Caja {{ caja.codigo || 'Código pendiente' }} abierta desde {{ fechaHoraGuatemala(caja.abiertaEn) }} (Guatemala).
        Monto inicial: <strong>{{ quetzales(caja.montoInicialCentavos) }}</strong>.</p>
      <template v-if="!caja">
        <p>Necesitas una caja propia abierta para registrar pagos.</p>
        <form v-if="puedeRegistrar" class="formulario-grid" @submit.prevent="abrirCaja">
          <label>Monto inicial en quetzales <span class="requisito-campo">Obligatorio</span>
            <input v-model="montoInicial" inputmode="decimal" required placeholder="0.00" /></label>
          <button type="submit" :disabled="ocupado">Abrir mi caja</button>
        </form>
      </template>
      <form v-else class="formulario-grid" @submit.prevent="cerrarCaja">
        <label>Efectivo contado al cierre <span class="requisito-campo">Obligatorio</span>
          <input v-model="efectivoContado" inputmode="decimal" required placeholder="0.00" /></label>
        <button type="submit" class="secundario" :disabled="ocupado">Cerrar mi caja</button>
      </form>
      <dl v-if="cierre" class="pagos-resumen">
        <div><dt>Código de caja</dt><dd>{{ cierre.codigo || 'Código pendiente' }}</dd></div>
        <div><dt>Ingresos válidos</dt><dd>{{ quetzales(cierre.totalIngresosCentavos) }}</dd></div>
        <div><dt>Efectivo esperado</dt><dd>{{ quetzales(cierre.efectivoEsperadoCentavos) }}</dd></div>
        <div><dt>Diferencia</dt><dd>{{ quetzales(cierre.diferenciaCentavos) }}</dd></div>
      </dl>
    </section>

    <section class="tarjeta">
      <h2>Consultar pagos</h2>
      <form class="formulario-grid" @submit.prevent="buscarPacientes">
        <label>Buscar paciente por código o nombre <span class="requisito-campo">Opcional</span>
          <input v-model="textoPaciente" maxlength="80" placeholder="PAC-000001 o nombre" /></label>
        <button type="submit" class="secundario">Buscar paciente</button>
      </form>
      <div v-if="resultadosPaciente.length" class="pagos-resultados">
        <button v-for="paciente in resultadosPaciente" :key="paciente.id" type="button"
          class="secundario" @click="elegirPaciente(paciente)">
          {{ paciente.codigo || 'Sin código' }} · {{ paciente.nombres }} {{ paciente.apellidos }}
        </button>
      </div>
      <p v-if="filtros.paciente">Paciente filtrado: <strong>{{ nombrePaciente || filtros.paciente }}</strong>
        <button type="button" class="secundario" @click="quitarPaciente">Quitar filtro</button></p>
      <form class="formulario-grid" @submit.prevent="filtrar">
        <label>Fecha de pago en Guatemala <span class="requisito-campo">Opcional</span>
          <input v-model="filtros.fecha" type="date" /></label>
        <label>Método <span class="requisito-campo">Opcional</span>
          <select v-model="filtros.metodo"><option value="">Todos</option>
            <option value="EFECTIVO">Efectivo</option><option value="TRANSFERENCIA">Transferencia</option>
            <option value="TARJETA">Tarjeta</option></select></label>
        <button type="submit">Aplicar filtros</button>
      </form>
      <p v-if="cargando" role="status">Cargando pagos…</p>
      <p v-else>{{ total }} pago(s) encontrados. Página {{ pagina + 1 }}.</p>
      <div class="tabla-contenedor"><table>
        <thead><tr><th>Fecha</th><th>Comprobante</th><th>Paciente</th><th>Método</th><th>Monto</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody><tr v-for="pago in pagos" :key="pago.id">
          <td>{{ fechaHoraGuatemala(pago.fechaPago) }}</td>
          <td>{{ pago.numeroComprobante }}</td>
          <td>{{ pago.pacienteNombre || pago.pacienteCodigo || 'Paciente no disponible' }}</td>
          <td>{{ pago.metodo }}</td><td>{{ quetzales(pago.montoCentavos) }}</td>
          <td>{{ pago.estado }}</td>
          <td><button type="button" class="secundario" @click="consultarPago(pago.id)">Ver detalle</button></td>
        </tr><tr v-if="!pagos.length"><td colspan="7">No hay pagos para estos filtros.</td></tr></tbody>
      </table></div>
      <div class="acciones"><button type="button" class="secundario" :disabled="pagina === 0"
          @click="cambiarPagina(-1)">Anterior</button>
        <button type="button" class="secundario" :disabled="!hayMas" @click="cambiarPagina(1)">Siguiente</button></div>
    </section>

    <section class="tarjeta">
      <h2>Saldo de una cita</h2>
      <label>Selecciona una cita de las más recientes
        <select v-model="citaId" @change="seleccionarCita(citaId)">
          <option value="">Selecciona una cita</option>
          <option v-for="item in citas" :key="item.id" :value="item.id">
            {{ fechaCorta(item.fecha) }} · {{ item.paciente.codigo || item.paciente.nombre }} · {{ item.servicio.nombre }}
          </option>
        </select>
      </label>
      <p>Para localizar citas anteriores, abre el historial del paciente o busca desde Citas.</p>
      <template v-if="cita && saldo">
        <h3>{{ cita.paciente.nombre }} · {{ fechaCorta(cita.fecha) }} · {{ cita.servicio.nombre }}</h3>
        <dl class="pagos-resumen">
          <div><dt>Precio histórico</dt><dd>{{ quetzales(saldo.precioCentavos) }}</dd></div>
          <div><dt>Pagos válidos</dt><dd>{{ quetzales(saldo.totalPagadoCentavos) }}</dd></div>
          <div><dt>Saldo pendiente</dt><dd>{{ quetzales(saldo.saldoPendienteCentavos) }}</dd></div>
          <div><dt>Estado financiero</dt><dd>{{ saldo.estadoFinanciero }}</dd></div>
        </dl>
        <form v-if="puedeRegistrar" class="formulario-grid" @submit.prevent="registrarPago">
          <label>Monto a pagar en quetzales <span class="requisito-campo">Obligatorio</span>
            <input v-model="monto" inputmode="decimal" required placeholder="0.00" /></label>
          <label>Método <span class="requisito-campo">Obligatorio</span>
            <select v-model="metodo" required><option value="EFECTIVO">Efectivo</option>
              <option value="TRANSFERENCIA">Transferencia</option><option value="TARJETA">Tarjeta</option></select></label>
          <div class="acciones campo-ancho">
            <button type="button" class="secundario" :disabled="!saldo.saldoPendienteCentavos"
              @click="monto = entradaQuetzales(saldo.saldoPendienteCentavos)">Usar saldo completo</button>
            <button type="submit" :disabled="ocupado || !caja ||
              (!saldo.saldoPendienteCentavos && !reintentoDisponible)">Registrar pago o abono</button>
          </div>
          <p v-if="!caja" class="campo-ancho">Abre tu caja antes de registrar.</p>
        </form>
        <p v-if="comprobante" role="status">Último comprobante interno: <strong>{{ comprobante.numeroComprobante }}</strong>
          · {{ quetzales(comprobante.montoCentavos) }} · {{ comprobante.estado }}.</p>
        <h3>Historial de pagos de la cita</h3>
        <div class="tabla-contenedor"><table>
          <thead><tr><th>Fecha</th><th>Comprobante</th><th>Método</th><th>Monto</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody><tr v-for="pago in historial" :key="pago.id">
            <td>{{ fechaHoraGuatemala(pago.fechaPago) }}</td><td>{{ pago.numeroComprobante }}</td>
            <td>{{ pago.metodo }}</td><td>{{ quetzales(pago.montoCentavos) }}</td><td>{{ pago.estado }}</td>
            <td><button type="button" class="secundario" @click="consultarPago(pago.id)">Ver</button></td>
          </tr><tr v-if="!historial.length"><td colspan="6">Sin pagos para esta cita.</td></tr></tbody>
        </table></div>
        <div class="acciones"><button type="button" class="secundario" :disabled="paginaHistorial === 0"
            @click="paginaHistorial--; cargarHistorial()">Anterior</button>
          <button type="button" class="secundario" :disabled="!hayMasHistorial"
            @click="paginaHistorial++; cargarHistorial()">Siguiente</button></div>
      </template>
    </section>

    <section v-if="pagoDetalle" class="tarjeta" aria-label="Detalle del pago">
      <h2>Comprobante {{ pagoDetalle.numeroComprobante }}</h2>
      <p>{{ fechaHoraGuatemala(pagoDetalle.fechaPago) }} (Guatemala) ·
        {{ pagoDetalle.metodo }} · {{ quetzales(pagoDetalle.montoCentavos) }} · {{ pagoDetalle.estado }}</p>
      <p v-if="pagoDetalle.estado === 'ANULADO' && esAdministrador">
        Motivo: {{ pagoDetalle.motivoAnulacion || 'No disponible' }} ·
        Anulado el {{ fechaHoraGuatemala(pagoDetalle.fechaAnulacion) }}.</p>
      <form v-if="puedeAnular && pagoDetalle.estado === 'REGISTRADO'" class="formulario-grid"
        @submit.prevent="anularPago">
        <label class="campo-ancho">Motivo de anulación <span class="requisito-campo">Obligatorio</span>
          <textarea v-model.trim="motivo" required maxlength="500" /></label>
        <button type="submit" :disabled="ocupado">Anular pago</button>
      </form>
      <button type="button" class="secundario" @click="pagoDetalle = null">Cerrar detalle</button>
    </section>
  </main>
</template>
