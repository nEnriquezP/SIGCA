<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { etiquetaEstado, fechaCorta, mesGuatemala } from '../utils/formatoCita.js'

const router = useRouter()
const sesion = useSesionStore()
const gestiona = computed(() => sesion.tienePermiso('CITAS_GESTIONAR'))
const mes = ref(mesGuatemala())
const profesional = ref('')
const profesionales = ref([])
const resumen = ref([])
const seleccionado = ref('')
const citasDia = ref([])
const totalDia = ref(0)
const paginaDia = ref(0)
const cargando = ref(false)
const cargandoDia = ref(false)
const error = ref('')
const diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const tituloMes = computed(() => new Intl.DateTimeFormat('es-GT', {
  timeZone: 'UTC', month: 'long', year: 'numeric',
}).format(new Date(`${mes.value}-01T12:00:00Z`)))
const resumenPorFecha = computed(() => new Map(resumen.value.map((dia) => [dia.fecha, dia])))
const casillas = computed(() => {
  const [anio, numeroMes] = mes.value.split('-').map(Number)
  const primerDia = new Date(Date.UTC(anio, numeroMes - 1, 1)).getUTCDay()
  const blancos = (primerDia + 6) % 7
  const cantidad = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate()
  return [...Array(blancos).fill(null), ...Array.from({ length: cantidad }, (_, indice) =>
    `${mes.value}-${String(indice + 1).padStart(2, '0')}`)]
})

function fallo(err) {
  if (err.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = err.message || 'No se pudo cargar el calendario'
}
function parametros(extra = {}) {
  const query = new URLSearchParams(extra)
  if (gestiona.value && profesional.value) query.set('profesional', profesional.value)
  return query
}
async function cargarMes() {
  cargando.value = true
  error.value = ''
  seleccionado.value = ''
  citasDia.value = []
  try {
    const datos = await solicitarApi(`/api/citas/calendario?${parametros({ mes: mes.value })}`,
      { token: sesion.token })
    resumen.value = datos.dias
  } catch (err) { fallo(err) } finally { cargando.value = false }
}
async function cargarDia() {
  if (!seleccionado.value) return
  cargandoDia.value = true
  error.value = ''
  try {
    const datos = await solicitarApi(`/api/citas?${parametros({ fecha: seleccionado.value,
      pagina: String(paginaDia.value) })}`, { token: sesion.token })
    citasDia.value = datos.citas
    totalDia.value = datos.total
  } catch (err) { fallo(err) } finally { cargandoDia.value = false }
}
async function elegirDia(fecha) {
  seleccionado.value = fecha
  paginaDia.value = 0
  await cargarDia()
}
async function moverPagina(direccion) {
  paginaDia.value += direccion
  await cargarDia()
}
async function moverMes(direccion) {
  const [anio, numeroMes] = mes.value.split('-').map(Number)
  mes.value = new Date(Date.UTC(anio, numeroMes - 1 + direccion, 1))
    .toISOString().slice(0, 7)
  await cargarMes()
}
onMounted(async () => {
  if (gestiona.value) {
    try {
      profesionales.value = (await solicitarApi('/api/citas/opciones',
        { token: sesion.token })).profesionales
    } catch (err) { fallo(err) }
  }
  await cargarMes()
})
</script>

<template>
  <main class="contenedor">
    <h1>Calendario de citas</h1>
    <p>Vista mensual con horarios de Guatemala. Selecciona un día para ver sus citas.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <section class="tarjeta">
      <div class="calendario-controles">
        <div class="acciones">
          <button type="button" class="secundario" aria-label="Mes anterior" @click="moverMes(-1)">←</button>
          <h2>{{ tituloMes }}</h2>
          <button type="button" class="secundario" aria-label="Mes siguiente" @click="moverMes(1)">→</button>
        </div>
        <label v-if="gestiona">Profesional
          <select v-model="profesional" @change="cargarMes"><option value="">Todos</option>
            <option v-for="p in profesionales" :key="p.id" :value="p.id">{{ p.nombre }}</option>
          </select></label>
      </div>
      <p v-if="cargando" role="status">Cargando mes…</p>
      <div v-else class="calendario-mes" aria-label="Días del mes">
        <strong v-for="dia in diasSemana" :key="dia" class="calendario-encabezado">{{ dia }}</strong>
        <div v-for="(fecha, indice) in casillas" :key="fecha || `vacio-${indice}`"
          class="calendario-casilla" :class="{ vacia: !fecha }">
          <button v-if="fecha" type="button" :aria-pressed="seleccionado === fecha"
            :aria-label="`${fechaCorta(fecha)}: ${resumenPorFecha.get(fecha)?.total || 0} citas`"
            @click="elegirDia(fecha)">
            <strong>{{ Number(fecha.slice(-2)) }}</strong>
            <span v-if="resumenPorFecha.has(fecha)" class="calendario-conteo">
              {{ resumenPorFecha.get(fecha).total }} cita(s)
            </span>
          </button>
        </div>
      </div>
      <p v-if="!resumen.length && !cargando">No hay citas en este mes.</p>
    </section>
    <section v-if="seleccionado" class="tarjeta">
      <h2>Citas del {{ fechaCorta(seleccionado) }}</h2>
      <p v-if="cargandoDia" role="status">Cargando día…</p>
      <template v-else>
        <p>{{ totalDia }} cita(s). Página {{ paginaDia + 1 }}.</p>
        <div class="tabla-contenedor"><table>
          <thead><tr><th>Hora</th><th>Paciente</th><th>Servicio</th><th>Profesional</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody><tr v-for="cita in citasDia" :key="cita.id">
            <td>{{ cita.horaInicio }}–{{ cita.horaFin }}</td>
            <td>{{ cita.paciente.codigo || 'Sin código' }} · {{ cita.paciente.nombre }}</td>
            <td>{{ cita.servicio.nombre }}</td><td>{{ cita.profesional.nombre }}</td>
            <td><span class="estado-cita" :class="`estado-${cita.estado.toLowerCase()}`">{{ etiquetaEstado(cita.estado) }}</span></td>
            <td><RouterLink :to="{ name: 'citas', query: { id: cita.id, fecha: seleccionado } }">Ver detalle</RouterLink></td>
          </tr><tr v-if="!citasDia.length"><td colspan="6">No hay citas en este día.</td></tr></tbody>
        </table></div>
        <div class="acciones">
          <button type="button" class="secundario" :disabled="paginaDia === 0" @click="moverPagina(-1)">Anterior</button>
          <button type="button" class="secundario" :disabled="(paginaDia + 1) * 100 >= totalDia" @click="moverPagina(1)">Siguiente</button>
        </div>
      </template>
    </section>
  </main>
</template>
