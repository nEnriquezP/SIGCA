<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'

const props = defineProps({ modelValue: { type: String, default: '' },
  endpoint: { type: String, required: true } })
const emit = defineEmits(['update:modelValue', 'invalido', 'seleccion'])
const sesion = useSesionStore()
const consulta = ref('')
const pacientes = ref([])
const seleccionado = ref(null)
const total = ref(0)
const pagina = ref(0)
const cargando = ref(false)
const error = ref('')
const lista = ref(null)
const idLista = `pacientes-activos-${Math.random().toString(36).slice(2)}`
const hayMas = computed(() => pacientes.value.length < total.value)
let version = 0
let espera
let controlador

function enfocarOpcion(evento, direccion) {
  const botones = [...(lista.value?.querySelectorAll('[data-opcion]') || [])]
  const indice = botones.indexOf(evento.target)
  botones[(indice + direccion + botones.length) % botones.length]?.focus()
}

async function cargar(reiniciar = true) {
  const actual = ++version
  controlador?.abort()
  controlador = new AbortController()
  const paginaSolicitada = reiniciar ? 0 : pagina.value + 1
  cargando.value = true
  error.value = ''
  const query = new URLSearchParams({ soloPacientes: '1',
    paginaPacientes: String(paginaSolicitada) })
  if (consulta.value.trim()) query.set('buscarPaciente', consulta.value.trim())
  if (props.modelValue) query.set('pacienteSeleccionado', props.modelValue)
  try {
    const datos = await solicitarApi(`${props.endpoint}?${query}`, {
      token: sesion.token, signal: controlador.signal, silencioso: true,
    })
    if (actual !== version) return
    pagina.value = paginaSolicitada
    total.value = datos.pacientesTotal
    const siguientes = reiniciar ? datos.pacientes : [...pacientes.value, ...datos.pacientes]
    pacientes.value = [...new Map(siguientes.map((p) => [p.id, p])).values()]
    if (props.modelValue) {
      if (datos.pacienteSeleccionado) {
        seleccionado.value = datos.pacienteSeleccionado
        emit('seleccion', datos.pacienteSeleccionado)
      }
      else {
        seleccionado.value = null
        emit('update:modelValue', '')
        emit('seleccion', null)
        emit('invalido', 'El paciente seleccionado ya no está activo. Elige otro.')
      }
    }
  } catch (fallo) {
    if (fallo.name !== 'AbortError' && actual === version) {
      error.value = fallo.message || 'No se pudieron cargar los pacientes.'
    }
  } finally {
    if (actual === version) cargando.value = false
  }
}

function elegir(paciente) {
  seleccionado.value = paciente
  emit('update:modelValue', paciente.id)
  emit('seleccion', paciente)
}

function quitar() {
  seleccionado.value = null
  emit('update:modelValue', '')
  emit('seleccion', null)
}

watch(consulta, () => {
  version += 1
  controlador?.abort()
  clearTimeout(espera)
  espera = setTimeout(() => cargar(true), consulta.value ? 250 : 0)
})
watch(() => props.modelValue, (valor) => {
  if (!valor) { seleccionado.value = null; emit('seleccion', null) }
  else if (seleccionado.value?.id !== valor) cargar(true)
})
useOpcionesVivas(() => cargar(true), ['pacientes'])
onUnmounted(() => { clearTimeout(espera); controlador?.abort() })
cargar(true)
</script>

<template>
  <fieldset class="selector-pacientes" data-campo="paciente" :aria-describedby="`${idLista}-estado`">
    <legend>Pacientes Activos <span class="requisito-campo">Obligatorio</span></legend>
    <label>Buscar por código, nombres o apellidos <span class="requisito-campo">Opcional</span>
      <input v-model="consulta" type="search" maxlength="80" autocomplete="off"
        placeholder="Escribe desde la primera letra" @keydown.down.prevent="lista?.querySelector('[data-opcion]')?.focus()" />
    </label>
    <p v-if="seleccionado" class="selector-seleccionado">
      Seleccionado: <strong>{{ seleccionado.codigo || 'Sin código' }} · {{ seleccionado.nombre }}</strong>
      <button type="button" class="secundario" @click="quitar">Quitar selección</button>
    </p>
    <div :id="idLista" ref="lista" class="selector-opciones" aria-label="Resultados de pacientes activos">
      <button v-for="paciente in pacientes" :key="paciente.id" type="button" data-opcion
        class="selector-opcion" :aria-pressed="modelValue === paciente.id"
        @click="elegir(paciente)" @keydown.down.prevent="enfocarOpcion($event, 1)"
        @keydown.up.prevent="enfocarOpcion($event, -1)">
        {{ paciente.codigo || 'Sin código' }} · {{ paciente.nombre }}
      </button>
    </div>
    <p :id="`${idLista}-estado`" role="status" aria-live="polite">
      <template v-if="cargando">Cargando pacientes…</template>
      <template v-else-if="error">{{ error }}</template>
      <template v-else-if="!total">{{ consulta.trim() ? 'No hay coincidencias.' : 'No hay pacientes activos.' }}</template>
      <template v-else>Mostrando {{ pacientes.length }} de {{ total }} pacientes.</template>
    </p>
    <button v-if="hayMas" type="button" class="secundario" :disabled="cargando" @click="cargar(false)">
      Cargar 10 más
    </button>
  </fieldset>
</template>
