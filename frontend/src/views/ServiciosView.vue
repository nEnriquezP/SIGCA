<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import ImagenCampo from '../components/ImagenCampo.vue'

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
  const texto = String(valor).trim()
  if (!/^Q (?:0|[1-9]\d{0,2}(?:,\d{3})*)\.\d{2}$/.test(texto)) {
    throw new Error('Escribe el precio en quetzales con dos decimales')
  }
  const centavos = Number(texto.replace(/\D/g, ''))
  if (!Number.isSafeInteger(centavos) || centavos < 100 || centavos > 3000000000) {
    throw new Error('El precio debe estar entre Q 1.00 y Q 30,000,000.00')
  }
  return centavos
}

function formatoPrecio(centavos) {
  return `Q ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(centavos / 100)}`
}

function actualizarPrecio(evento) {
  const digitos = evento.target.value.replace(/\D/g, '')
  const centavos = Number(digitos)
  if (!digitos) formulario.value.precioQuetzales = ''
  else if (centavos <= 3000000000) formulario.value.precioQuetzales = formatoPrecio(centavos)
  evento.target.value = formulario.value.precioQuetzales
  evento.target.setSelectionRange(evento.target.value.length, evento.target.value.length)
}

function actualizarNombre(evento) {
  const limpio = evento.target.value.replace(/[^\p{L}\p{N} _-]/gu, '')
  evento.target.value = limpio
  formulario.value.nombre = limpio
}

function datosFormulario() {
  if (!formulario.value.imagen) throw new Error('Carga una imagen del servicio')
  if (!/^[\p{L}\p{N}]+(?:[ _-][\p{L}\p{N}]+)*$/u.test(formulario.value.nombre.trim())) {
    throw new Error('El nombre solo admite letras, números, espacios, guion y guion bajo')
  }
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
    precioQuetzales: formatoPrecio(servicio.precioCentavos), imagen: servicio.imagen,
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
    <p v-else>Servicios activos disponibles. Los precios se muestran en quetzales. Una solicitud expresa una fecha preferida y no reserva horario.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="administracion && sesion.tienePermiso('SERVICIOS_GESTIONAR')" class="tarjeta">
      <h2>{{ editandoId ? 'Actualizar servicio' : 'Registrar servicio' }}</h2>
      <form class="formulario-servicio" @submit.prevent="guardar">
        <div class="servicio-form-layout">
          <div class="servicio-form-datos">
            <h3>Datos del servicio</h3>
            <div class="servicio-campos">
              <label class="servicio-campo-ancho">Nombre <span class="requisito-campo">Obligatorio</span>
                <input v-model.trim="formulario.nombre" @input="actualizarNombre" required maxlength="120"
                  placeholder="Ej. Consulta general" />
                <small>Se admiten letras, números, espacios, guion (-) y guion bajo (_).</small>
              </label>
              <label>Duración en minutos <span class="requisito-campo">Obligatorio</span>
                <input v-model="formulario.duracionMinutos" type="number" min="1" max="1440" step="1" required />
                <small>Entre 1 y 1,440 minutos; las citas terminan el mismo día.</small>
              </label>
              <label>Precio en quetzales <span class="requisito-campo">Obligatorio</span>
                <input :value="formulario.precioQuetzales" @input="actualizarPrecio" type="text"
                  inputmode="numeric" class="servicio-precio" placeholder="Q 1.00" required />
                <small>Escribe las cifras; los centavos y miles se muestran automáticamente. De Q 1.00 a Q 30,000,000.00.</small>
              </label>
              <label class="servicio-campo-ancho">Descripción <span class="requisito-campo">Obligatorio</span>
                <textarea v-model.trim="formulario.descripcion" required maxlength="2000" />
              </label>
            </div>
          </div>
          <ImagenCampo v-model="formulario.imagen" categoria="servicio" etiqueta="Imagen del servicio"
            obligatoria mostrar-requisito />
        </div>
        <div class="acciones">
          <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : 'Registrar' }}</button>
          <button v-if="editandoId" type="button" class="secundario" @click="cancelarEdicion">Cancelar</button>
        </div>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Consultar y buscar</h2>
      <form class="formulario-grid" @submit.prevent="cargar">
        <label>Código, nombre o descripción<input v-model="buscar" maxlength="80" placeholder="Ej. SERV-INT-0001" /></label>
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
          <button type="button" @click="router.push({ name: 'solicitar-cita', query: { servicio: servicio.id } })">Solicitar cita</button>
          <p>La fecha preferida no es una cita confirmada.</p>
        </article>
        <p v-if="!servicios.length">No hay servicios activos en esta búsqueda.</p>
      </div>
      <div v-else class="servicios-lista">
        <p v-if="!servicios.length">No hay servicios en esta búsqueda.</p>
        <article v-for="servicio in servicios" :key="servicio.id" class="servicio-resumen">
          <img class="servicio-resumen-imagen" :src="servicio.imagen" :alt="`Imagen de ${servicio.nombre}`" />
          <div class="servicio-resumen-cuerpo">
            <div class="servicio-resumen-encabezado">
              <div>
                <span class="servicio-codigo">{{ servicio.codigo || 'Código pendiente' }}</span>
                <h3>{{ servicio.nombre }}</h3>
              </div>
              <span class="servicio-estado" :class="servicio.estado === 'ACTIVO' ? 'activo' : 'inactivo'">{{ servicio.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}</span>
            </div>
            <p class="servicio-resumen-descripcion">{{ servicio.descripcion }}</p>
            <div class="servicio-resumen-pie">
              <div class="servicio-datos-clave">
                <span><small>Duración</small><strong>{{ servicio.duracionMinutos }} min</strong></span>
                <span><small>Precio</small><strong>{{ mostrarPrecio(servicio.precioCentavos) }}</strong></span>
              </div>
              <div class="acciones servicio-resumen-acciones">
                <button type="button" @click="consultar(servicio)">Ver detalle</button>
                <button v-if="sesion.tienePermiso('SERVICIOS_GESTIONAR')" type="button" class="secundario" @click="editar(servicio)">Modificar</button>
                <button v-if="sesion.tienePermiso('SERVICIOS_GESTIONAR')" type="button" class="secundario" @click="cambiarEstado(servicio)">
                  {{ servicio.estado === 'ACTIVO' ? 'Desactivar' : 'Activar' }}
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-if="detalle && administracion" class="tarjeta servicio-detalle">
      <div class="servicio-detalle-imagen"><img :src="detalle.imagen" :alt="`Imagen de ${detalle.nombre}`" /></div>
      <div class="servicio-detalle-contenido">
        <span class="servicio-codigo">{{ detalle.codigo || 'Código pendiente' }}</span>
        <h2>{{ detalle.nombre }}</h2>
        <span class="servicio-estado" :class="detalle.estado === 'ACTIVO' ? 'activo' : 'inactivo'">{{ detalle.estado === 'ACTIVO' ? 'Activo' : 'Inactivo' }}</span>
        <div class="servicio-detalle-metricas">
          <div><small>Duración estimada</small><strong>{{ detalle.duracionMinutos }} minutos</strong></div>
          <div><small>Precio del servicio</small><strong>{{ mostrarPrecio(detalle.precioCentavos) }}</strong></div>
        </div>
        <h3>Descripción</h3>
        <p class="texto-preservado">{{ detalle.descripcion }}</p>
      </div>
    </section>
  </main>
</template>
