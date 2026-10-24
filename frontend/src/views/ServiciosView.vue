<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const props = defineProps({ administracion: { type: Boolean, default: false } })
const router = useRouter()
const sesion = useSesionStore()
const servicios = ref([])
const buscar = ref('')
const estadoFiltro = ref('')
const detalle = ref(null)
const formulario = ref(vacio())
const editandoId = ref(null)
const cargando = ref(false)
const guardando = ref(false)
const error = ref('')
const aviso = ref('')

function vacio() {
  return { nombre: '', descripcion: '', duracionMinutos: '', precioQuetzales: '', imagen: '' }
}

function mostrarPrecio(centavos) {
  return new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ' })
    .format(centavos / 100)
}

function precioACentavos(valor) {
  const coincidencia = /^(0|[1-9]\d*)(?:[.,](\d{1,2}))?$/.exec(String(valor).trim())
  if (!coincidencia) throw new Error('Escribe el precio en quetzales con hasta dos decimales')
  const centavos = Number(coincidencia[1]) * 100 +
    Number((coincidencia[2] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(centavos) || centavos < 1 || centavos > 100000000) {
    throw new Error('El precio debe estar entre Q0.01 y Q1,000,000.00')
  }
  return centavos
}

function datosFormulario() {
  const duracion = String(formulario.value.duracionMinutos).trim()
  if (!/^\d+$/.test(duracion) || Number(duracion) < 1 || Number(duracion) > 1440) {
    throw new Error('La duración debe ser un número entero entre 1 y 1440 minutos')
  }
  return {
    nombre: formulario.value.nombre.trim(), descripcion: formulario.value.descripcion.trim(),
    duracionMinutos: Number(duracion),
    precioCentavos: precioACentavos(formulario.value.precioQuetzales),
    imagen: formulario.value.imagen.trim(),
  }
}

function manejarError(fallo) {
  if (fallo.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = fallo.message || 'No se pudo completar la operación'
}

async function cargar() {
  cargando.value = true
  error.value = ''
  const parametros = new URLSearchParams()
  if (buscar.value.trim()) parametros.set('buscar', buscar.value.trim())
  if (props.administracion && estadoFiltro.value) parametros.set('estado', estadoFiltro.value)
  const ruta = props.administracion ? '/api/servicios/administracion' : '/api/servicios'
  try {
    const datos = await solicitarApi(`${ruta}${parametros.size ? `?${parametros}` : ''}`,
      { token: props.administracion ? sesion.token : undefined })
    servicios.value = datos.servicios
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    cargando.value = false
  }
}

async function consultar(servicio) {
  error.value = ''
  const ruta = props.administracion ?
    `/api/servicios/administracion/${servicio.id}` : `/api/servicios/${servicio.id}`
  try {
    const datos = await solicitarApi(ruta,
      { token: props.administracion ? sesion.token : undefined })
    detalle.value = datos.servicio
  } catch (fallo) {
    manejarError(fallo)
  }
}

function editar(servicio) {
  editandoId.value = servicio.id
  formulario.value = {
    nombre: servicio.nombre, descripcion: servicio.descripcion,
    duracionMinutos: String(servicio.duracionMinutos),
    precioQuetzales: (servicio.precioCentavos / 100).toFixed(2), imagen: servicio.imagen,
  }
  error.value = ''
  aviso.value = ''
}

function cancelarEdicion() {
  editandoId.value = null
  formulario.value = vacio()
}

async function guardar() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const datos = datosFormulario()
    await solicitarApi(editandoId.value ? `/api/servicios/${editandoId.value}` : '/api/servicios', {
      method: editandoId.value ? 'PUT' : 'POST', token: sesion.token, body: datos,
    })
    aviso.value = editandoId.value ? 'Servicio actualizado' : 'Servicio registrado'
    cancelarEdicion()
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

async function cambiarEstado(servicio) {
  const proximo = servicio.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
  if (!window.confirm(`¿Confirmas cambiar el servicio a ${proximo}? El registro permanecerá guardado.`)) return
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi(`/api/servicios/${servicio.id}/estado`, {
      method: 'PATCH', token: sesion.token, body: { estado: proximo },
    })
    aviso.value = `Servicio ${proximo.toLowerCase()}`
    if (detalle.value?.id === servicio.id) detalle.value.estado = proximo
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  }
}

onMounted(cargar)
watch(() => props.administracion, () => {
  detalle.value = null
  cancelarEdicion()
  cargar()
})
</script>

<template>
  <main class="contenedor">
    <h1>{{ administracion ? 'Servicios internos' : 'Servicios' }}</h1>
    <p v-if="administracion">Administración y recepción consultan todos los servicios. Solo el administrador puede cambiarlos.</p>
    <p v-else>Servicios activos disponibles. Los precios se muestran en quetzales. La solicitud de citas se habilitará en la fase 6.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="administracion && sesion.usuario?.rol === 'ADMINISTRADOR'" class="tarjeta">
      <h2>{{ editandoId ? 'Actualizar servicio' : 'Registrar servicio' }}</h2>
      <form class="formulario-grid" @submit.prevent="guardar">
        <label>Nombre<input v-model.trim="formulario.nombre" required maxlength="120" /></label>
        <label>Duración en minutos<input v-model="formulario.duracionMinutos" type="number" min="1" max="1440" step="1" required /></label>
        <label>Precio en quetzales<input v-model.trim="formulario.precioQuetzales" type="text" inputmode="decimal" placeholder="250.00" required /></label>
        <label>Imagen (URL HTTP(S) o ruta)<input v-model.trim="formulario.imagen" required maxlength="500" placeholder="https://… o /imagenes/…" /></label>
        <label>Descripción<textarea v-model.trim="formulario.descripcion" required maxlength="2000" /></label>
        <div class="acciones">
          <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Registrar' }}</button>
          <button v-if="editandoId" type="button" class="secundario" @click="cancelarEdicion">Cancelar</button>
        </div>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Consultar y buscar</h2>
      <form class="formulario-grid" @submit.prevent="cargar">
        <label>Nombre, descripción o identificador<input v-model="buscar" maxlength="80" /></label>
        <label v-if="administracion">Estado
          <select v-model="estadoFiltro">
            <option value="">Todos</option><option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
          </select>
        </label>
        <button type="submit">Buscar</button>
      </form>
      <p v-if="cargando">Cargando servicios…</p>
      <div v-else-if="!administracion && !error" class="portal-grid">
        <article v-for="servicio in servicios" :key="servicio.id" class="tarjeta">
          <img class="portal-imagen" :src="servicio.imagen" :alt="`Imagen de ${servicio.nombre}`" />
          <h3>{{ servicio.nombre }}</h3>
          <p class="texto-preservado">{{ servicio.descripcion }}</p>
          <p>Duración estimada: {{ servicio.duracionMinutos }} minutos</p>
          <p>Precio: {{ mostrarPrecio(servicio.precioCentavos) }}</p>
          <button type="button" disabled title="Disponible en la fase 6">Solicitar cita</button>
          <p>El formulario y el envío de solicitudes estarán disponibles en la fase 6.</p>
        </article>
        <p v-if="!servicios.length">No hay servicios activos en esta búsqueda.</p>
      </div>
      <div v-else class="tabla-contenedor">
        <table>
          <thead><tr><th>Servicio</th><th>Duración</th><th>Precio</th><th v-if="administracion">Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="servicio in servicios" :key="servicio.id">
              <td>{{ servicio.nombre }}</td>
              <td>{{ servicio.duracionMinutos }} min</td>
              <td>{{ mostrarPrecio(servicio.precioCentavos) }}</td>
              <td v-if="administracion">{{ servicio.estado }}</td>
              <td class="acciones">
                <button type="button" class="secundario" @click="consultar(servicio)">Consultar</button>
                <button v-if="administracion && sesion.usuario?.rol === 'ADMINISTRADOR'" type="button" class="secundario" @click="editar(servicio)">Modificar</button>
                <button v-if="administracion && sesion.usuario?.rol === 'ADMINISTRADOR'" type="button" class="secundario" @click="cambiarEstado(servicio)">
                  {{ servicio.estado === 'ACTIVO' ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="!servicios.length"><td :colspan="administracion ? 5 : 4">No hay servicios en esta búsqueda.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="detalle" class="tarjeta">
      <h2>Detalle del servicio</h2>
      <p><strong>{{ detalle.nombre }}</strong> · {{ detalle.duracionMinutos }} minutos · {{ mostrarPrecio(detalle.precioCentavos) }}</p>
      <p v-if="administracion">Estado: {{ detalle.estado }}</p>
      <p>{{ detalle.descripcion }}</p>
      <p>Identificador: {{ detalle.id }}</p>
      <img :src="detalle.imagen" :alt="`Imagen de ${detalle.nombre}`" width="240" style="max-width: 100%; height: auto" />
    </section>
  </main>
</template>
