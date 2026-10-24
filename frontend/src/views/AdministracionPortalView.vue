<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const emit = defineEmits(['contenido-actualizado'])
const router = useRouter()
const sesion = useSesionStore()
const contenido = ref(contenidoVacio())
const publicaciones = ref([])
const actividades = ref([])
const mensajes = ref([])
const publicacion = ref(publicacionVacia())
const actividad = ref(actividadVacia())
const publicacionId = ref(null)
const actividadId = ref(null)
const cargando = ref(true)
const guardando = ref(false)
const error = ref('')
const aviso = ref('')

function contenidoVacio() {
  return { nombreCentro: '', logo: '', informacionPrincipal: '', mision: '', vision: '',
    carrusel: [], contacto: { correo: '', telefono: '', direccion: '' } }
}
function publicacionVacia() {
  return { titulo: '', descripcion: '', fechaPublicacion: '', imagen: '', enlace: '' }
}
function actividadVacia() {
  return { tipo: 'CAPACITACION', titulo: '', descripcion: '', imagenes: [] }
}

function fallo(f) {
  if (f.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = f.message || 'No se pudo completar la operación'
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const [datosContenido, datosPublicaciones, datosActividades, datosMensajes] = await Promise.all([
      solicitarApi('/api/contenido'),
      solicitarApi('/api/publicaciones/administracion', { token: sesion.token }),
      solicitarApi('/api/actividades/administracion', { token: sesion.token }),
      solicitarApi('/api/mensajes-contacto', { token: sesion.token }),
    ])
    contenido.value = datosContenido.contenido || contenidoVacio()
    publicaciones.value = datosPublicaciones.publicaciones
    actividades.value = datosActividades.actividades
    mensajes.value = datosMensajes.mensajes
  } catch (f) {
    fallo(f)
  } finally {
    cargando.value = false
  }
}

async function ejecutar(tarea, exito) {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    await tarea()
    aviso.value = exito
  } catch (f) {
    fallo(f)
  } finally {
    guardando.value = false
  }
}

function urlValida(valor) {
  if (typeof valor !== 'string' || !valor.trim() || valor.trim().length > 500 || /\s|\\/.test(valor)) return false
  if (valor.startsWith('/')) return !valor.startsWith('//')
  try {
    const url = new URL(valor)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

function limpiarImagenes(lista) {
  return lista.map((valor) => valor.trim())
}

async function guardarContenido() {
  const datos = {
    ...contenido.value,
    nombreCentro: contenido.value.nombreCentro.trim(), logo: contenido.value.logo.trim(),
    informacionPrincipal: contenido.value.informacionPrincipal.trim(),
    mision: contenido.value.mision.trim(), vision: contenido.value.vision.trim(),
    carrusel: limpiarImagenes(contenido.value.carrusel),
    contacto: Object.fromEntries(Object.entries(contenido.value.contacto).map(([clave, valor]) =>
      [clave, valor.trim()])),
  }
  if (datos.logo && !urlValida(datos.logo)) return fallo(new Error('Logotipo: usa URL HTTP(S) o ruta /'))
  if (datos.carrusel.length && (datos.carrusel.length < 5 || datos.carrusel.length > 10)) {
    return fallo(new Error('El carrusel necesita entre 5 y 10 imágenes o ninguna'))
  }
  if (!datos.carrusel.every(urlValida)) return fallo(new Error('Revisa las URL o rutas del carrusel'))
  await ejecutar(async () => {
    const respuesta = await solicitarApi('/api/contenido', {
      method: 'PUT', token: sesion.token, body: datos,
    })
    contenido.value = respuesta.contenido
    emit('contenido-actualizado')
  }, 'Contenido institucional guardado')
}

function editarPublicacion(item) {
  publicacionId.value = item.id
  publicacion.value = Object.fromEntries(['titulo', 'descripcion', 'fechaPublicacion', 'imagen', 'enlace']
    .map((clave) => [clave, item[clave]]))
  error.value = ''
}

function cancelarPublicacion() {
  publicacionId.value = null
  publicacion.value = publicacionVacia()
}

async function guardarPublicacion() {
  const datos = Object.fromEntries(Object.entries(publicacion.value).map(([clave, valor]) =>
    [clave, valor.trim()]))
  if ((datos.imagen && !urlValida(datos.imagen)) || (datos.enlace && !urlValida(datos.enlace))) {
    return fallo(new Error('La imagen y el enlace deben ser URL HTTP(S) o rutas /'))
  }
  await ejecutar(async () => {
    await solicitarApi(publicacionId.value ? `/api/publicaciones/${publicacionId.value}` : '/api/publicaciones', {
      method: publicacionId.value ? 'PUT' : 'POST', token: sesion.token, body: datos,
    })
    cancelarPublicacion()
    publicaciones.value = (await solicitarApi('/api/publicaciones/administracion',
      { token: sesion.token })).publicaciones
  }, 'Publicación guardada')
}

function editarActividad(item) {
  actividadId.value = item.id
  actividad.value = { tipo: item.tipo, titulo: item.titulo,
    descripcion: item.descripcion, imagenes: [...item.imagenes] }
  error.value = ''
}

function cancelarActividad() {
  actividadId.value = null
  actividad.value = actividadVacia()
}

async function guardarActividad() {
  const datos = { tipo: actividad.value.tipo, titulo: actividad.value.titulo.trim(),
    descripcion: actividad.value.descripcion.trim(),
    imagenes: limpiarImagenes(actividad.value.imagenes) }
  if (datos.imagenes.length > 10 || !datos.imagenes.every(urlValida)) {
    return fallo(new Error('La actividad admite hasta 10 imágenes con URL HTTP(S) o ruta /'))
  }
  await ejecutar(async () => {
    await solicitarApi(actividadId.value ? `/api/actividades/${actividadId.value}` : '/api/actividades', {
      method: actividadId.value ? 'PUT' : 'POST', token: sesion.token, body: datos,
    })
    cancelarActividad()
    actividades.value = (await solicitarApi('/api/actividades/administracion',
      { token: sesion.token })).actividades
  }, 'Actividad guardada')
}

async function cambiarEstado(tipo, item) {
  const nuevo = !item.activo
  if (!window.confirm(`¿Confirmas ${nuevo ? 'publicar' : 'ocultar'} «${item.titulo}»? El registro se conservará.`)) return
  const ruta = tipo === 'publicacion' ? 'publicaciones' : 'actividades'
  await ejecutar(async () => {
    await solicitarApi(`/api/${ruta}/${item.id}/estado`, {
      method: 'PATCH', token: sesion.token, body: { activo: nuevo },
    })
    const datos = await solicitarApi(`/api/${ruta}/administracion`, { token: sesion.token })
    if (tipo === 'publicacion') publicaciones.value = datos.publicaciones
    else actividades.value = datos.actividades
  }, nuevo ? 'Contenido publicado' : 'Contenido oculto')
}

onMounted(cargar)
</script>

<template>
  <main class="contenedor">
    <h1>Administrar portal</h1>
    <p>Los cambios guardados se muestran en el portal público. Las imágenes se registran por URL o ruta.</p>
    <p v-if="cargando" role="status">Cargando administración…</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>
    <button v-if="error && !guardando" type="button" class="secundario" @click="cargar">Recargar datos</button>

    <template v-if="!cargando">
      <section class="tarjeta">
        <h2>Identidad e información institucional</h2>
        <form class="formulario-grid" @submit.prevent="guardarContenido">
          <label>Nombre del centro<input v-model="contenido.nombreCentro" required maxlength="120" /></label>
          <label>Logotipo (URL o ruta, opcional)<input v-model="contenido.logo" maxlength="500" /></label>
          <label>Información principal<textarea v-model="contenido.informacionPrincipal" required maxlength="2000" /></label>
          <label>Misión<textarea v-model="contenido.mision" required maxlength="2000" /></label>
          <label>Visión<textarea v-model="contenido.vision" required maxlength="2000" /></label>
          <label>Correo de contacto<input v-model="contenido.contacto.correo" type="email" required maxlength="254" /></label>
          <label>Teléfono de contacto<input v-model="contenido.contacto.telefono" type="tel" required maxlength="30" /></label>
          <label>Dirección<input v-model="contenido.contacto.direccion" required maxlength="300" /></label>
          <fieldset>
            <legend>Imágenes del carrusel</legend>
            <p>Guarda ninguna imagen o entre 5 y 10. No se muestran imágenes de ejemplo.</p>
            <div class="lista-imagenes">
              <label v-for="(_, indice) in contenido.carrusel" :key="indice">Imagen {{ indice + 1 }}
                <input v-model="contenido.carrusel[indice]" required maxlength="500" />
                <button type="button" class="secundario" @click="contenido.carrusel.splice(indice, 1)">Quitar</button>
              </label>
            </div>
            <button type="button" class="secundario" :disabled="contenido.carrusel.length >= 10"
              @click="contenido.carrusel.push('')">Agregar imagen</button>
          </fieldset>
          <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Guardar contenido' }}</button>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Publicaciones educativas</h2>
        <form class="formulario-grid" @submit.prevent="guardarPublicacion">
          <label>Título<input v-model="publicacion.titulo" required maxlength="160" /></label>
          <label>Fecha de publicación<input v-model="publicacion.fechaPublicacion" type="date" required /></label>
          <label>Descripción<textarea v-model="publicacion.descripcion" required maxlength="4000" /></label>
          <label>Imagen opcional<input v-model="publicacion.imagen" maxlength="500" /></label>
          <label>Enlace opcional<input v-model="publicacion.enlace" maxlength="500" /></label>
          <div class="acciones"><button type="submit" :disabled="guardando">{{ publicacionId ? 'Guardar cambios' : 'Crear publicación' }}</button>
            <button v-if="publicacionId" type="button" class="secundario" @click="cancelarPublicacion">Cancelar</button></div>
        </form>
        <p v-if="!publicaciones.length">No hay publicaciones registradas.</p>
        <div v-else class="tabla-contenedor"><table>
          <thead><tr><th>Título</th><th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody><tr v-for="item in publicaciones" :key="item.id"><td>{{ item.titulo }}</td><td>{{ item.fechaPublicacion }}</td>
            <td>{{ item.activo ? 'Visible' : 'Oculta' }}</td><td class="acciones">
              <button type="button" class="secundario" @click="editarPublicacion(item)">Editar</button>
              <button type="button" class="secundario" :disabled="guardando" @click="cambiarEstado('publicacion', item)">{{ item.activo ? 'Ocultar' : 'Publicar' }}</button>
            </td></tr></tbody>
        </table></div>
      </section>

      <section class="tarjeta">
        <h2>Capacitaciones y actividades</h2>
        <form class="formulario-grid" @submit.prevent="guardarActividad">
          <label>Tipo<select v-model="actividad.tipo"><option value="CAPACITACION">Capacitación</option>
            <option value="ESCUELA_PADRES">Escuela para padres</option><option value="OTRA">Otra actividad</option></select></label>
          <label>Título<input v-model="actividad.titulo" required maxlength="160" /></label>
          <label>Descripción<textarea v-model="actividad.descripcion" required maxlength="4000" /></label>
          <fieldset><legend>Imágenes relacionadas</legend>
            <div class="lista-imagenes"><label v-for="(_, indice) in actividad.imagenes" :key="indice">Imagen {{ indice + 1 }}
              <input v-model="actividad.imagenes[indice]" required maxlength="500" />
              <button type="button" class="secundario" @click="actividad.imagenes.splice(indice, 1)">Quitar</button>
            </label></div>
            <button type="button" class="secundario" :disabled="actividad.imagenes.length >= 10"
              @click="actividad.imagenes.push('')">Agregar imagen</button>
          </fieldset>
          <div class="acciones"><button type="submit" :disabled="guardando">{{ actividadId ? 'Guardar cambios' : 'Crear actividad' }}</button>
            <button v-if="actividadId" type="button" class="secundario" @click="cancelarActividad">Cancelar</button></div>
        </form>
        <p v-if="!actividades.length">No hay actividades registradas.</p>
        <div v-else class="tabla-contenedor"><table>
          <thead><tr><th>Título</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody><tr v-for="item in actividades" :key="item.id"><td>{{ item.titulo }}</td><td>{{ item.tipo }}</td>
            <td>{{ item.activo ? 'Visible' : 'Oculta' }}</td><td class="acciones">
              <button type="button" class="secundario" @click="editarActividad(item)">Editar</button>
              <button type="button" class="secundario" :disabled="guardando" @click="cambiarEstado('actividad', item)">{{ item.activo ? 'Ocultar' : 'Publicar' }}</button>
            </td></tr></tbody>
        </table></div>
      </section>

      <section class="tarjeta">
        <h2>Mensajes de contacto</h2>
        <p>Solo un administrador puede consultar estos datos.</p>
        <p v-if="!mensajes.length">No hay mensajes recibidos.</p>
        <div v-else class="tabla-contenedor"><table>
          <thead><tr><th>Fecha</th><th>Nombre</th><th>Correo y teléfono</th><th>Asunto</th><th>Mensaje</th></tr></thead>
          <tbody><tr v-for="item in mensajes" :key="item.id"><td>{{ new Date(item.creadoEn).toLocaleString('es-GT', { timeZone: 'America/Guatemala' }) }}</td>
            <td>{{ item.nombre }}</td><td>{{ item.correo }}<br />{{ item.telefono }}</td><td>{{ item.asunto }}</td><td class="texto-preservado">{{ item.mensaje }}</td></tr></tbody>
        </table></div>
      </section>
      <section class="tarjeta"><h2>Datos operativos</h2>
        <p>Los servicios y horarios se editan en sus pantallas existentes.</p>
        <div class="acciones"><RouterLink to="/gestion-servicios">Gestionar servicios</RouterLink>
          <RouterLink to="/gestion-horarios">Gestionar horarios</RouterLink></div>
      </section>
    </template>
  </main>
</template>
