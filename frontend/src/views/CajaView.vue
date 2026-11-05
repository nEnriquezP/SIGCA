<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { rutaListadoCajas, rutaMovimientosCaja } from '../utils/consultasCaja.js'
import { quetzales } from '../utils/dinero.js'
import { fechaCorta, fechaHoraGuatemala } from '../utils/formatoCita.js'

const route = useRoute()
const router = useRouter()
const sesion = useSesionStore()
const esAdministrador = computed(() => sesion.usuario?.rol === 'ADMINISTRADOR')

const actual = ref(null)
const cajas = ref([])
const total = ref(0)
const pagina = ref(0)
const estado = ref('')
const fechaOperativa = ref('')
const responsable = ref('')
const filtrosAplicados = ref({ estado: '', fechaOperativa: '', usuarioResponsable: '' })
const responsables = ref([])
const usuariosPorId = ref({})
const errorUsuarios = ref('')
const detalle = ref(null)
const conciliacion = ref(null)
const movimientos = ref([])
const totalMovimientos = ref(0)
const paginaMovimientos = ref(0)
const cargandoActual = ref(false)
const cargandoListado = ref(false)
const cargandoDetalle = ref(false)
const cargandoMovimientos = ref(false)
const cargandoUsuarios = ref(false)
const errorActual = ref('')
const errorListado = ref('')
const errorDetalle = ref('')
const errorMovimientos = ref('')
const detalleElemento = ref(null)
let versionListado = 0
let versionDetalle = 0
let versionMovimientos = 0

const idSeleccionado = computed(() => typeof route.query.id === 'string' ? route.query.id : '')
const hayMas = computed(() => (pagina.value + 1) * 50 < total.value)
const hayMasMovimientos = computed(() => (paginaMovimientos.value + 1) * 50 < totalMovimientos.value)
const actualizando = computed(() => cargandoActual.value || cargandoListado.value ||
  cargandoDetalle.value || cargandoMovimientos.value || cargandoUsuarios.value)

function nombreResponsable(id) {
  return usuariosPorId.value[id] || 'Usuario no disponible'
}

function mensajeError(fallo) {
  if (fallo.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
    return 'La sesión terminó. Ingresa de nuevo.'
  }
  const inicio = { 400: 'Revisa los filtros o el identificador',
    403: 'No tienes permiso para consultar esta caja',
    404: 'La caja no existe o no está disponible para tu usuario',
    409: 'Los datos cambiaron; vuelve a actualizar' }[fallo.status]
  return inicio ? `${inicio}. ${fallo.message}` :
    (fallo.message || 'No se pudo completar la consulta')
}

async function cargarActual() {
  cargandoActual.value = true
  errorActual.value = ''
  try {
    actual.value = (await solicitarApi('/api/cajas/actual', {
      token: sesion.token, silencioso: true })).caja
  } catch (fallo) {
    actual.value = null
    errorActual.value = mensajeError(fallo)
  } finally { cargandoActual.value = false }
}

async function cargarUsuarios() {
  if (!esAdministrador.value) return
  cargandoUsuarios.value = true
  errorUsuarios.value = ''
  try {
    const datos = await solicitarApi('/api/usuarios',
      { token: sesion.token, silencioso: true })
    responsables.value = datos.usuarios
    usuariosPorId.value = Object.fromEntries(datos.usuarios.map((usuario) =>
      [usuario.id, usuario.nombre]))
  } catch (fallo) {
    errorUsuarios.value = 'No se pudieron cargar los nombres de responsables.'
    if (fallo.status === 401) mensajeError(fallo)
  } finally { cargandoUsuarios.value = false }
}

async function cargarListado() {
  const version = ++versionListado
  cargandoListado.value = true
  errorListado.value = ''
  try {
    const datos = await solicitarApi(rutaListadoCajas({ pagina: pagina.value,
      ...filtrosAplicados.value }), { token: sesion.token, silencioso: true })
    if (version !== versionListado) return
    cajas.value = datos.cajas
    total.value = datos.total
  } catch (fallo) {
    if (version !== versionListado) return
    cajas.value = []
    total.value = 0
    errorListado.value = mensajeError(fallo)
  } finally {
    if (version === versionListado) cargandoListado.value = false
  }
}

async function cargarMovimientos(id, paginaSolicitada = paginaMovimientos.value) {
  const version = ++versionMovimientos
  cargandoMovimientos.value = true
  errorMovimientos.value = ''
  try {
    const datos = await solicitarApi(rutaMovimientosCaja(id, paginaSolicitada),
      { token: sesion.token, silencioso: true })
    if (version !== versionMovimientos || id !== idSeleccionado.value) return
    movimientos.value = datos.movimientos
    totalMovimientos.value = datos.total
    paginaMovimientos.value = datos.pagina
  } catch (fallo) {
    if (version !== versionMovimientos || id !== idSeleccionado.value) return
    movimientos.value = []
    totalMovimientos.value = 0
    errorMovimientos.value = mensajeError(fallo)
  } finally {
    if (version === versionMovimientos) cargandoMovimientos.value = false
  }
}

async function cargarDetalle(id) {
  const version = ++versionDetalle
  cargandoDetalle.value = true
  errorDetalle.value = ''
  try {
    const datos = await solicitarApi(`/api/cajas/${encodeURIComponent(id)}`,
      { token: sesion.token, silencioso: true })
    if (version !== versionDetalle || id !== idSeleccionado.value) return
    detalle.value = datos.caja
    conciliacion.value = datos.conciliacion || null
    await cargarMovimientos(id)
  } catch (fallo) {
    if (version !== versionDetalle || id !== idSeleccionado.value) return
    detalle.value = null
    conciliacion.value = null
    movimientos.value = []
    totalMovimientos.value = 0
    errorDetalle.value = mensajeError(fallo)
  } finally {
    if (version === versionDetalle) cargandoDetalle.value = false
  }
}

function aplicarFiltros() {
  filtrosAplicados.value = { estado: estado.value, fechaOperativa: fechaOperativa.value,
    usuarioResponsable: esAdministrador.value ? responsable.value : '' }
  pagina.value = 0
  cargarListado()
}

function limpiarFiltros() {
  estado.value = ''
  fechaOperativa.value = ''
  responsable.value = ''
  aplicarFiltros()
}

function moverPagina(direccion) {
  pagina.value = Math.max(0, pagina.value + direccion)
  cargarListado()
}

function moverPaginaMovimientos(direccion) {
  const siguiente = Math.max(0, paginaMovimientos.value + direccion)
  if (idSeleccionado.value) cargarMovimientos(idSeleccionado.value, siguiente)
}

async function verCaja(id) {
  await router.push({ name: 'caja', query: { id } })
  await nextTick()
  detalleElemento.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function cerrarDetalle() {
  router.push({ name: 'caja' })
}

function recargar() {
  cargarActual()
  cargarListado()
  cargarUsuarios()
  if (idSeleccionado.value) cargarDetalle(idSeleccionado.value)
}

watch(idSeleccionado, (id) => {
  versionDetalle++
  versionMovimientos++
  cargandoDetalle.value = false
  cargandoMovimientos.value = false
  detalle.value = null
  conciliacion.value = null
  movimientos.value = []
  totalMovimientos.value = 0
  paginaMovimientos.value = 0
  errorDetalle.value = ''
  errorMovimientos.value = ''
  if (id) cargarDetalle(id)
}, { immediate: true })

onMounted(() => {
  cargarActual()
  cargarListado()
  cargarUsuarios()
})
</script>

<template>
  <main class="contenedor caja-vista">
    <div class="caja-encabezado">
      <div>
        <h1>Caja diaria</h1>
        <p>Ingresos válidos por método, movimientos y cierres anteriores. Importes en quetzales.</p>
      </div>
      <button type="button" class="secundario" :disabled="actualizando" @click="recargar">
        {{ actualizando ? 'Actualizando…' : 'Actualizar datos' }}
      </button>
    </div>

    <section class="tarjeta caja-panel-actual" aria-labelledby="titulo-actual">
      <div class="caja-encabezado">
        <div><span class="caja-etiqueta">RESUMEN DE HOY</span><h2 id="titulo-actual">Mi caja abierta</h2>
          <p>Consulta los importes vigentes de tu caja. Usa «Actualizar datos» para renovarlos.</p></div>
        <div class="caja-acceso">
          <RouterLink class="caja-boton-pagos" to="/pagos"><span aria-hidden="true">↗</span> Ir a pagos</RouterLink>
          <small>Abre, registra pagos o cierra tu caja desde Pagos.</small>
        </div>
      </div>
      <p v-if="errorActual" class="mensaje-error" role="alert">{{ errorActual }}</p>
      <p v-else-if="cargandoActual && !actual">Cargando caja actual…</p>
      <p v-else-if="!actual" class="caja-vacia">No tienes una caja propia abierta. Puedes abrir una desde Pagos.</p>
      <template v-else>
        <div class="caja-identidad"><div><span class="caja-estado caja-estado--abierta">● Abierta</span>
          <strong>{{ actual.codigo || 'Código pendiente' }}</strong>
          <p>Fecha operativa: {{ fechaCorta(actual.fechaOperativa) }} · Apertura: {{ fechaHoraGuatemala(actual.abiertaEn) }} (Guatemala)</p></div>
          <button type="button" class="secundario" @click="verCaja(actual.id)">Ver movimientos →</button></div>
        <dl class="caja-totales caja-totales--actual">
          <div><dt>Monto inicial</dt><dd>{{ quetzales(actual.montoInicialCentavos) }}</dd></div>
          <div><dt>Ingreso en efectivo</dt><dd>{{ quetzales(actual.totalEfectivoCentavos) }}</dd></div>
          <div><dt>Ingreso por transferencia</dt><dd>{{ quetzales(actual.totalTransferenciaCentavos) }}</dd></div>
          <div><dt>Ingreso por tarjeta</dt><dd>{{ quetzales(actual.totalTarjetaCentavos) }}</dd></div>
          <div><dt>Total de ingresos válidos</dt><dd>{{ quetzales(actual.totalIngresosCentavos) }}</dd></div>
          <div><dt>Efectivo esperado</dt><dd>{{ quetzales(actual.efectivoEsperadoCentavos) }}</dd></div>
        </dl>
      </template>
    </section>

    <section class="tarjeta" aria-labelledby="titulo-historial">
      <h2 id="titulo-historial">Historial de cajas</h2>
      <p>{{ esAdministrador ? 'Puedes consultar todas las cajas.' : 'Solo aparecen tus cajas.' }}
        La fecha operativa corresponde al día de apertura en Guatemala, aunque la caja cruce la medianoche.</p>
      <p v-if="esAdministrador && errorUsuarios" class="mensaje-error" role="status">{{ errorUsuarios }}</p>
      <form class="formulario-grid caja-filtros" @submit.prevent="aplicarFiltros">
        <label>Estado
          <select v-model="estado"><option value="">Todos</option><option value="ABIERTA">Abierta</option>
            <option value="CERRADA">Cerrada</option></select>
        </label>
        <label>Fecha operativa (Guatemala)
          <input v-model="fechaOperativa" type="date" />
        </label>
        <label v-if="esAdministrador">Responsable
          <select v-model="responsable" :disabled="cargandoUsuarios || Boolean(errorUsuarios)">
            <option value="">Todos</option>
            <option v-for="usuario in responsables" :key="usuario.id" :value="usuario.id">
              {{ usuario.nombre }}{{ usuario.activo === false ? ' (inactivo)' : '' }}
            </option>
          </select>
        </label>
        <div class="acciones caja-filtros-acciones">
          <button type="submit" :disabled="cargandoListado">Aplicar filtros</button>
          <button type="button" class="secundario" :disabled="cargandoListado" @click="limpiarFiltros">Limpiar</button>
        </div>
      </form>
      <p v-if="errorListado" class="mensaje-error" role="alert">{{ errorListado }}</p>
      <p v-else-if="cargandoListado && !cajas.length">Cargando cajas…</p>
      <p v-else-if="!cajas.length">No hay cajas para estos filtros.</p>
      <div v-if="cajas.length" class="tabla-contenedor">
        <table>
          <thead><tr><th>Código de caja</th><th>Fecha operativa</th><th>Apertura</th><th>Estado</th>
            <th v-if="esAdministrador">Responsable</th><th>Ingresos al cierre</th><th>Acción</th></tr></thead>
          <tbody>
            <tr v-for="caja in cajas" :key="caja.id">
              <td>{{ caja.codigo || 'Código pendiente' }}</td>
              <td>{{ fechaCorta(caja.fechaOperativa) }}</td>
              <td>{{ fechaHoraGuatemala(caja.abiertaEn) }}</td>
              <td><span class="caja-estado" :class="caja.estado === 'ABIERTA' ? 'caja-estado--abierta' : 'caja-estado--cerrada'">{{ caja.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada' }}</span></td>
              <td v-if="esAdministrador" class="caja-id">
                <strong>{{ nombreResponsable(caja.usuarioResponsable) }}</strong>
              </td>
              <td>{{ caja.estado === 'CERRADA' ? quetzales(caja.totalIngresosCentavos) : 'En curso' }}</td>
              <td><button type="button" class="secundario" @click="verCaja(caja.id)">Ver detalle</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="acciones caja-paginacion">
        <button type="button" class="secundario" :disabled="pagina === 0 || cargandoListado"
          @click="moverPagina(-1)">Anterior</button>
        <span>Página {{ pagina + 1 }} · {{ total }} cajas</span>
        <button type="button" class="secundario" :disabled="!hayMas || cargandoListado"
          @click="moverPagina(1)">Siguiente</button>
      </div>
    </section>

    <section v-if="idSeleccionado" ref="detalleElemento" class="tarjeta caja-detalle" aria-labelledby="titulo-detalle">
      <div class="caja-encabezado">
        <h2 id="titulo-detalle">Detalle de caja</h2>
        <button type="button" class="secundario" @click="cerrarDetalle">Cerrar detalle</button>
      </div>
      <p v-if="errorDetalle" class="mensaje-error" role="alert">{{ errorDetalle }}</p>
      <p v-else-if="cargandoDetalle && !detalle">Cargando detalle…</p>
      <template v-if="detalle">
        <p>Caja <strong>{{ detalle.codigo || 'Código pendiente' }}</strong> ·
          <strong>{{ detalle.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada' }}</strong> ·
          Fecha operativa {{ fechaCorta(detalle.fechaOperativa) }} ·
          Abierta {{ fechaHoraGuatemala(detalle.abiertaEn) }} (Guatemala).</p>
        <p v-if="esAdministrador" class="caja-id">Responsable:
          <strong>{{ nombreResponsable(detalle.usuarioResponsable) }}</strong></p>
        <p v-if="detalle.estado === 'CERRADA'">Cerrada {{ fechaHoraGuatemala(detalle.cerradaEn) }} (Guatemala).
          Los importes mostrados son los guardados al cierre.</p>
        <p v-if="conciliacion?.coincide === false" class="mensaje-error caja-advertencia" role="alert">
          Advertencia: los importes históricos del cierre no coinciden con los movimientos válidos actuales.
          No se han modificado los importes guardados. Solicita una revisión administrativa.
        </p>
        <dl class="caja-totales">
          <div><dt>Monto inicial</dt><dd>{{ quetzales(detalle.montoInicialCentavos) }}</dd></div>
          <div><dt>Ingreso en efectivo</dt><dd>{{ quetzales(detalle.totalEfectivoCentavos) }}</dd></div>
          <div><dt>Ingreso por transferencia</dt><dd>{{ quetzales(detalle.totalTransferenciaCentavos) }}</dd></div>
          <div><dt>Ingreso por tarjeta</dt><dd>{{ quetzales(detalle.totalTarjetaCentavos) }}</dd></div>
          <div><dt>Total de ingresos válidos</dt><dd>{{ quetzales(detalle.totalIngresosCentavos) }}</dd></div>
          <div><dt>Efectivo esperado</dt><dd>{{ quetzales(detalle.efectivoEsperadoCentavos) }}</dd></div>
          <template v-if="detalle.estado === 'CERRADA'">
            <div><dt>Efectivo contado</dt><dd>{{ quetzales(detalle.efectivoContadoCentavos) }}</dd></div>
            <div><dt>Diferencia</dt><dd>{{ quetzales(detalle.diferenciaCentavos) }}</dd></div>
          </template>
        </dl>

        <div class="caja-movimientos-titulo"><div><span class="caja-etiqueta">HISTORIAL DE PAGOS</span>
          <h3>Movimientos de esta caja</h3>
          <p>Los pagos anulados se conservan en el historial y no suman ingresos válidos.</p></div>
          <span class="caja-conteo">{{ totalMovimientos }} movimientos</span></div>
        <p v-if="errorMovimientos" class="mensaje-error" role="alert">{{ errorMovimientos }}</p>
        <p v-else-if="cargandoMovimientos && !movimientos.length">Cargando movimientos…</p>
        <p v-else-if="!movimientos.length">No hay movimientos en esta página.</p>
        <div v-if="movimientos.length" class="tabla-contenedor">
          <table>
            <thead><tr><th>Comprobante</th><th>Fecha</th><th>Método</th><th>Importe</th>
              <th>Estado y auditoría</th><th>Cita</th></tr></thead>
            <tbody>
              <tr v-for="movimiento in movimientos" :key="movimiento.id">
                <td>{{ movimiento.numeroComprobante }}</td>
                <td>{{ fechaHoraGuatemala(movimiento.fechaPago) }}</td>
                <td>{{ movimiento.metodo }}</td>
                <td>{{ quetzales(movimiento.montoCentavos) }}</td>
                <td><strong class="caja-estado" :class="movimiento.estado === 'ANULADO' ? 'caja-estado--anulado' : 'caja-estado--abierta'">{{ movimiento.estado === 'ANULADO' ? 'Anulado' : 'Registrado' }}</strong>
                  <span v-if="movimiento.estado === 'ANULADO'" class="caja-auditoria">
                    Anulado {{ fechaHoraGuatemala(movimiento.fechaAnulacion) }}
                    <span v-if="movimiento.anuladoPor"> · Usuario: {{ movimiento.anuladoPor }}</span>
                    <span v-if="esAdministrador && movimiento.motivoAnulacion"> · Motivo: {{ movimiento.motivoAnulacion }}</span>
                  </span>
                </td>
                <td><RouterLink :to="{ name: 'pagos', query: { cita: movimiento.cita } }">Ver pagos de la cita</RouterLink></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="acciones caja-paginacion">
          <button type="button" class="secundario"
            :disabled="paginaMovimientos === 0 || cargandoMovimientos" @click="moverPaginaMovimientos(-1)">Anterior</button>
          <span>Página {{ paginaMovimientos + 1 }} · {{ totalMovimientos }} movimientos</span>
          <button type="button" class="secundario" :disabled="!hayMasMovimientos || cargandoMovimientos"
            @click="moverPaginaMovimientos(1)">Siguiente</button>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.caja-encabezado { display: flex; align-items: start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.caja-encabezado h1, .caja-encabezado h2 { margin-top: 0; }
.caja-panel-actual { background: linear-gradient(135deg, #fff 65%, #eef9f8); }
.caja-encabezado p { color: #566d80; margin: 4px 0 14px; }
.caja-etiqueta { display: block; color: #087f86; font-size: .73rem; font-weight: 800; letter-spacing: .09em; margin-bottom: 8px; }
.caja-acceso { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; max-width: 260px; }
.caja-acceso small { color: #52677a; line-height: 1.4; text-align: right; }
.caja-boton-pagos { display: inline-flex; gap: 9px; align-items: center; padding: 12px 19px; border-radius: 10px; background: #087f86; color: #fff; font-weight: 700; text-decoration: none; box-shadow: 0 5px 14px #087f862b; }
.caja-boton-pagos:hover { background: #066970; color: #fff; }
.caja-boton-pagos:focus-visible { outline: 3px solid #dcad46; outline-offset: 3px; }
.caja-vacia { padding: 20px; border: 1px dashed #bad6dc; border-radius: 12px; background: #f4fbfa; }
.caja-identidad { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 16px 18px; margin: 12px 0 18px; border: 1px solid #d5e9eb; border-radius: 12px; background: #f6fbfb; }
.caja-identidad strong { color: #17365d; margin-left: 10px; }
.caja-identidad p { margin: 8px 0 0; color: #52677a; font-size: .9rem; }
.caja-totales { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 18px 0; }
.caja-totales div { padding: 18px; border: 1px solid #dce8f0; border-radius: 12px; background: #f5f9fc; }
.caja-totales--actual div:nth-child(2) { background: #effaf4; border-color: #cce9d8; }
.caja-totales--actual div:nth-child(3) { background: #eef7fc; border-color: #cfe4f2; }
.caja-totales--actual div:nth-child(4) { background: #f4f1fb; border-color: #e2daf4; }
.caja-totales--actual div:nth-child(5) { background: #e8f6f5; border-color: #bfe2df; }
.caja-totales--actual div:nth-child(6) { background: #fff8e9; border-color: #f0dfb9; }
.caja-totales dt { color: #52677a; font-size: .85rem; }
.caja-totales dd { margin: 9px 0 0; color: #17365d; font-size: 1.25rem; font-weight: 800; overflow-wrap: anywhere; }
.caja-filtros { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 20px 0; }
.caja-filtros label { flex: 1 1 180px; max-width: 240px; }
.caja-filtros-acciones { align-self: end; }
.caja-estado { display: inline-block; padding: 5px 10px; border-radius: 999px; font-size: .78rem; font-weight: 700; white-space: nowrap; }
.caja-estado--abierta { background: #dcf4e8; color: #176743; }
.caja-estado--cerrada { background: #e9eff5; color: #425a70; }
.caja-estado--anulado { background: #fff1e0; color: #8c4e0b; }
.caja-detalle { scroll-margin-top: 24px; }
.caja-movimientos-titulo { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
.caja-movimientos-titulo h3 { margin: 0; }
.caja-movimientos-titulo p { color: #52677a; }
.caja-conteo { padding: 8px 12px; border-radius: 10px; color: #146c76; background: #e9f7f7; font-weight: 700; }
.caja-paginacion { align-items: center; margin-top: 16px; }
.caja-vista .tabla-contenedor { margin: 14px 0; }
.caja-vista table { min-width: 700px; }
.caja-id { font-size: .85rem; overflow-wrap: anywhere; }
.caja-auditoria { display: block; margin-top: 4px; font-size: .85rem; }
.caja-advertencia { padding: 12px; border: 1px solid currentColor; border-radius: 8px; }
.caja-enlace { margin-left: 8px; }
@media (max-width: 640px) {
  .caja-encabezado { display: block; }
  .caja-acceso { align-items: flex-start; max-width: none; margin: 14px 0; }
  .caja-acceso small { text-align: left; }
  .caja-filtros label { max-width: none; }
  .caja-encabezado > button, .caja-encabezado > a { margin: 8px 0; }
  .caja-totales { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 420px) { .caja-totales { grid-template-columns: 1fr; } }
</style>
