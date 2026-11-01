<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'

const props = defineProps({ administracion: { type: Boolean, default: false } })
const router = useRouter()
const sesion = useSesionStore()
const dias = [
  ['LUNES', 'Lunes'], ['MARTES', 'Martes'], ['MIERCOLES', 'Miércoles'],
  ['JUEVES', 'Jueves'], ['VIERNES', 'Viernes'], ['SABADO', 'Sábado'],
  ['DOMINGO', 'Domingo'],
]
const horarios = ref([])
const seleccionado = ref('LUNES')
const formulario = ref({ activo: false, intervalos: [] })
const cargando = ref(false)
const guardando = ref(false)
const error = ref('')
const aviso = ref('')

function nombreDia(codigo) {
  return dias.find(([dia]) => dia === codigo)?.[1] ?? codigo
}

function horarioDe(dia) {
  return horarios.value.find((horario) => horario.dia === dia)
}

function textoIntervalos(intervalos) {
  return intervalos.map(({ horaInicio, horaFin }) => `${horaInicio}–${horaFin}`).join(', ')
}

function seleccionar(dia) {
  seleccionado.value = dia
  const existente = horarioDe(dia)
  formulario.value = existente ? {
    activo: existente.activo,
    intervalos: existente.intervalos.map((intervalo) => ({ ...intervalo })),
  } : { activo: false, intervalos: [] }
  error.value = ''
}

function manejarError(fallo) {
  if (fallo.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = fallo.message || 'No se pudo completar la operación'
}

async function cargar(preservarFormulario = false) {
  cargando.value = true
  error.value = ''
  try {
    const anterior = horarioDe(seleccionado.value)
    const baseAnterior = anterior ? { activo: anterior.activo,
      intervalos: anterior.intervalos.map((intervalo) => ({ ...intervalo })) } :
      { activo: false, intervalos: [] }
    const hayEdicion = JSON.stringify(formulario.value) !== JSON.stringify(baseAnterior)
    const ruta = props.administracion ? '/api/horarios/administracion' : '/api/horarios'
    const datos = await solicitarApi(ruta,
      { token: props.administracion ? sesion.token : undefined })
    horarios.value = datos.horarios
    if (props.administracion && !(preservarFormulario && hayEdicion)) seleccionar(seleccionado.value)
    else if (props.administracion && hayEdicion &&
        JSON.stringify(anterior) !== JSON.stringify(horarioDe(seleccionado.value))) {
      aviso.value = 'El horario cambió mientras editabas. Revisa los datos antes de guardar.'
    }
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    cargando.value = false
  }
}

function agregarIntervalo() {
  formulario.value.intervalos.push({ horaInicio: '', horaFin: '' })
}

function quitarIntervalo(indice) {
  formulario.value.intervalos.splice(indice, 1)
}

async function guardar() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi(`/api/horarios/${seleccionado.value}`, {
      method: 'PUT', token: sesion.token,
      body: { activo: formulario.value.activo, intervalos: formulario.value.intervalos },
    })
    aviso.value = `Horario de ${nombreDia(seleccionado.value)} guardado`
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

onMounted(cargar)
useOpcionesVivas(() => cargar(true), ['horarios'])
watch(() => props.administracion, () => cargar())
</script>

<template>
  <main class="contenedor">
    <h1>{{ administracion ? 'Horarios internos' : 'Horarios de atención' }}</h1>
    <p>Las horas corresponden a America/Guatemala.</p>
    <p v-if="administracion">Administración y recepción consultan la configuración completa. Solo el administrador puede modificarla.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section class="tarjeta">
      <h2>{{ administracion ? 'Días configurados' : 'Días disponibles' }}</h2>
      <p v-if="cargando">Cargando horarios…</p>
      <div v-else-if="administracion" class="tabla-contenedor">
        <table>
          <thead><tr><th>Día</th><th>Estado</th><th>Intervalos</th><th v-if="sesion.tienePermiso('HORARIOS_GESTIONAR')">Acción</th></tr></thead>
          <tbody>
            <tr v-for="[dia, nombre] in dias" :key="dia">
              <td>{{ nombre }}</td>
              <td>{{ horarioDe(dia) ? horarioDe(dia).activo ? 'Abierto' : 'Cerrado' : 'Sin configurar' }}</td>
              <td>{{ horarioDe(dia)?.intervalos.length ? textoIntervalos(horarioDe(dia).intervalos) : '—' }}</td>
              <td v-if="sesion.tienePermiso('HORARIOS_GESTIONAR')"><button type="button" class="secundario" @click="seleccionar(dia)">Configurar</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else-if="horarios.length" class="tabla-contenedor">
        <table>
          <thead><tr><th>Día</th><th>Horario</th></tr></thead>
          <tbody>
            <tr v-for="horario in horarios" :key="horario.dia">
              <td>{{ nombreDia(horario.dia) }}</td>
              <td>{{ textoIntervalos(horario.intervalos) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else>Aún no hay horarios de atención configurados.</p>
    </section>

    <section v-if="administracion && sesion.tienePermiso('HORARIOS_GESTIONAR')" class="tarjeta">
      <h2>Configurar {{ nombreDia(seleccionado) }}</h2>
      <form @submit.prevent="guardar">
        <label>Día <span class="requisito-campo">Obligatorio</span>
          <select :value="seleccionado" @change="seleccionar($event.target.value)">
            <option v-for="[dia, nombre] in dias" :key="dia" :value="dia">{{ nombre }}</option>
          </select>
        </label>
        <label><span>Día abierto al público <span class="requisito-campo">Obligatorio</span></span><input v-model="formulario.activo" type="checkbox" style="width: auto" /></label>
        <fieldset>
          <legend>Intervalos de atención <span class="requisito-campo">Obligatorios si el día está abierto</span></legend>
          <div v-for="(intervalo, indice) in formulario.intervalos" :key="indice" class="formulario-grid" style="display: grid; margin-bottom: 12px">
            <label>Inicio <span class="requisito-campo">Obligatorio si agregas un intervalo</span><input v-model="intervalo.horaInicio" type="time" required /></label>
            <label>Fin <span class="requisito-campo">Obligatorio si agregas un intervalo</span><input v-model="intervalo.horaFin" type="time" required /></label>
            <button type="button" class="secundario" @click="quitarIntervalo(indice)">Quitar intervalo</button>
          </div>
          <button type="button" class="secundario" :disabled="formulario.intervalos.length >= 8" @click="agregarIntervalo">Agregar intervalo</button>
        </fieldset>
        <p>Un día abierto necesita al menos un intervalo. Los intervalos no pueden traslaparse.</p>
        <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar horario' }}</button>
      </form>
    </section>
  </main>
</template>
