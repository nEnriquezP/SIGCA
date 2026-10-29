<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import AvatarUsuario from '../components/AvatarUsuario.vue'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'

const router = useRouter()
const sesion = useSesionStore()
const usuarios = ref([])
const error = ref('')
const aviso = ref('')
const cargando = ref(false)
const guardando = ref(false)
const nuevo = ref({ nombre: '', correo: '', rol: 'RECEPCIONISTA', password: '' })
const edicion = ref(null)
const edicionOriginal = ref(null)
const restablecimiento = ref(null)
const accionesAbiertas = ref(null)
const usuarioEnDetalle = ref(null)
const dialogoUsuario = ref(null)
const verPasswordInicial = ref(false)
const verPasswordNueva = ref(false)
const verPasswordAdministrador = ref(false)
const roles = ref([])
const catalogoPermisos = ref([])
const configuracionRoles = ref(false)
const formularioRol = ref({ codigo: '', nombre: '', permisos: [] })
const formularioRolOriginal = ref(JSON.stringify(formularioRol.value))
const dependenciasPermisos = {
  SOLICITUDES_GESTIONAR: ['SOLICITUDES_VER', 'PACIENTES_VER'],
  PACIENTES_GESTIONAR: ['PACIENTES_VER', 'RESPONSABLES_VER'],
  RESPONSABLES_GESTIONAR: ['RESPONSABLES_VER'],
  SERVICIOS_GESTIONAR: ['SERVICIOS_VER'],
  HORARIOS_GESTIONAR: ['HORARIOS_VER'],
}
const patronCorreo = '[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,63}'
const patronPassword = '(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[@#$_])[A-Za-z0-9@#$_]{8,30}'

function requisitosPassword(password) {
  return [
    { texto: 'Entre 8 y 30 caracteres', cumplido: password.length >= 8 && password.length <= 30 },
    { texto: 'Al menos una letra mayúscula', cumplido: /[A-Z]/.test(password) },
    { texto: 'Al menos una letra minúscula', cumplido: /[a-z]/.test(password) },
    { texto: 'Al menos un número', cumplido: /\d/.test(password) },
    { texto: 'Al menos un símbolo: @ # $ _', cumplido: /[@#$_]/.test(password) },
    { texto: 'Sin espacios ni otros símbolos', cumplido: password.length > 0 && /^[A-Za-z0-9@#$_]+$/.test(password) },
  ]
}

const requisitosIniciales = computed(() => requisitosPassword(nuevo.value.password))
const requisitosNuevos = computed(() => requisitosPassword(restablecimiento.value?.passwordNueva ?? ''))
const hayCambios = computed(() =>
  JSON.stringify(nuevo.value) !== JSON.stringify({ nombre: '', correo: '', rol: 'RECEPCIONISTA', password: '' }) ||
  (edicion.value !== null && JSON.stringify(edicion.value) !== edicionOriginal.value) ||
  Boolean(restablecimiento.value?.passwordNueva || restablecimiento.value?.passwordAdministrador) ||
  JSON.stringify(formularioRol.value) !== formularioRolOriginal.value)
const { advertenciaVisible, confirmarSalida, seguirEditando, salirSinGuardar } = useCambiosSinGuardar(hayCambios)

function limpiarNombre(evento) {
  const limpio = evento.target.value.replace(/[^\p{L} ]/gu, '')
  evento.target.value = limpio
  return limpio
}

function manejarError(fallo) {
  if (fallo.status === 401) {
    sesion.cerrar()
    router.push({ name: 'ingresar' })
  }
  error.value = fallo.message || 'No se pudo completar la operación'
}

async function cargarRoles() {
  try {
    const datos = await solicitarApi('/api/roles', { token: sesion.token })
    roles.value = datos.roles
    catalogoPermisos.value = datos.catalogo
  } catch (fallo) {
    manejarError(fallo)
  }
}

function nombrePermiso(codigo) {
  return catalogoPermisos.value.find((permiso) => permiso.codigo === codigo)?.nombre || codigo
}

function nombreRol(codigo) {
  return roles.value.find((rol) => rol.codigo === codigo)?.nombre || codigo
}

function alternarAcciones(id) {
  accionesAbiertas.value = accionesAbiertas.value === id ? null : id
}

async function verUsuario(usuario) {
  accionesAbiertas.value = null
  usuarioEnDetalle.value = usuario
  await nextTick()
  dialogoUsuario.value?.showModal()
}

function nuevoRol() {
  formularioRol.value = { codigo: '', nombre: '', permisos: [] }
  formularioRolOriginal.value = JSON.stringify(formularioRol.value)
}

async function descartarEdicionRol() {
  if (JSON.stringify(formularioRol.value) !== formularioRolOriginal.value &&
      !await confirmarSalida()) return
  nuevoRol()
}

async function editarRol(rol) {
  if (rol.predefinido) return
  if (JSON.stringify(formularioRol.value) !== formularioRolOriginal.value &&
      !await confirmarSalida()) return
  formularioRol.value = { codigo: rol.codigo, nombre: rol.nombre, permisos: [...rol.permisos] }
  formularioRolOriginal.value = JSON.stringify(formularioRol.value)
  configuracionRoles.value = true
}

function ajustarDependencias() {
  const permisos = new Set(formularioRol.value.permisos)
  for (const [permiso, dependencias] of Object.entries(dependenciasPermisos)) {
    if (permisos.has(permiso)) dependencias.forEach((dependencia) => permisos.add(dependencia))
  }
  formularioRol.value.permisos = [...permisos]
}

async function guardarRol() {
  error.value = ''
  aviso.value = ''
  guardando.value = true
  try {
    const { codigo, nombre, permisos } = formularioRol.value
    await solicitarApi(codigo ? `/api/roles/${codigo}` : '/api/roles', {
      method: codigo ? 'PUT' : 'POST', token: sesion.token,
      body: { nombre, permisos },
    })
    aviso.value = codigo ? 'Rol actualizado. Sus permisos se aplicarán al volver a iniciar sesión.' : 'Rol creado'
    nuevoRol()
    await cargarRoles()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

async function cargar() {
  cargando.value = true
  error.value = ''
  try {
    const datos = await solicitarApi('/api/usuarios', { token: sesion.token })
    usuarios.value = datos.usuarios
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    cargando.value = false
  }
}

async function crear() {
  error.value = ''
  aviso.value = ''
  guardando.value = true
  try {
    await solicitarApi('/api/usuarios', { method: 'POST', token: sesion.token, body: nuevo.value })
    nuevo.value = { nombre: '', correo: '', rol: 'RECEPCIONISTA', password: '' }
    verPasswordInicial.value = false
    aviso.value = 'Usuario creado'
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

async function editar(usuario) {
  if ((edicion.value !== null && JSON.stringify(edicion.value) !== edicionOriginal.value) ||
      restablecimiento.value?.passwordNueva || restablecimiento.value?.passwordAdministrador) {
    if (!await confirmarSalida()) return
  }
  edicion.value = { ...usuario }
  edicionOriginal.value = JSON.stringify(edicion.value)
  restablecimiento.value = null
  error.value = ''
  aviso.value = ''
}

async function guardar() {
  error.value = ''
  aviso.value = ''
  guardando.value = true
  const { id, nombre, correo, rol } = edicion.value
  const body = { nombre, correo, rol }

  try {
    await solicitarApi(`/api/usuarios/${id}`, { method: 'PUT', token: sesion.token, body })
    edicion.value = null
    edicionOriginal.value = null
    aviso.value = 'Usuario actualizado'
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

async function cambiarEstado(usuario) {
  if (!window.confirm(`¿Confirmas ${usuario.activo ? 'desactivar' : 'activar'} a ${usuario.nombre}?`)) return
  error.value = ''
  aviso.value = ''
  try {
    await solicitarApi(`/api/usuarios/${usuario.id}`, {
      method: 'PATCH', token: sesion.token, body: { activo: !usuario.activo },
    })
    aviso.value = usuario.activo ? 'Usuario desactivado' : 'Usuario activado'
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  }
}

async function cancelarEdicion() {
  if (edicion.value !== null && JSON.stringify(edicion.value) !== edicionOriginal.value &&
      !await confirmarSalida()) return
  edicion.value = null
  edicionOriginal.value = null
}

async function prepararRestablecimiento(usuario) {
  if ((edicion.value !== null && JSON.stringify(edicion.value) !== edicionOriginal.value) ||
      restablecimiento.value?.passwordNueva || restablecimiento.value?.passwordAdministrador) {
    if (!await confirmarSalida()) return
  }
  restablecimiento.value = { id: usuario.id, nombre: usuario.nombre,
    passwordNueva: '', passwordAdministrador: '' }
  verPasswordNueva.value = false
  verPasswordAdministrador.value = false
  edicion.value = null
  edicionOriginal.value = null
  error.value = ''
  aviso.value = ''
}

async function cancelarRestablecimiento() {
  if ((restablecimiento.value?.passwordNueva || restablecimiento.value?.passwordAdministrador) &&
      !await confirmarSalida()) return
  restablecimiento.value = null
}

async function restablecerPassword() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const { id, passwordNueva, passwordAdministrador } = restablecimiento.value
    await solicitarApi(`/api/usuarios/${id}/password`, {
      method: 'PUT', token: sesion.token, body: { passwordNueva, passwordAdministrador },
    })
    restablecimiento.value = null
    if (id === sesion.usuario?.id) {
      sesion.cerrar()
      await router.push({ name: 'ingresar', query: { password: 'actualizada' } })
    } else {
      aviso.value = 'Contraseña restablecida. Las sesiones anteriores de esa cuenta dejaron de ser válidas.'
    }
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

onMounted(() => Promise.all([cargar(), cargarRoles()]))
</script>

<template>
  <main class="contenedor">
    <div class="encabezado-usuarios">
      <h1>Usuarios</h1>
      <button type="button" class="secundario" :aria-expanded="configuracionRoles"
        @click="configuracionRoles = !configuracionRoles">⚙ Configuración de roles y permisos</button>
    </div>
    <p>Solo los administradores pueden crear y administrar cuentas.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section v-if="configuracionRoles" class="tarjeta" aria-label="Configuración de roles y permisos">
      <h2>Roles y permisos</h2>
      <p>Los tres roles originales conservan sus permisos. Puedes crear y editar roles adicionales para tareas específicas.</p>
      <div class="roles-lista">
        <article v-for="rol in roles" :key="rol.codigo" class="rol-resumen">
          <div class="rol-resumen-cabecera">
            <h3>{{ rol.nombre }}</h3>
            <button v-if="!rol.predefinido" type="button" class="secundario" @click="editarRol(rol)">Editar rol</button>
            <span v-else class="requisito-campo">Rol original</span>
          </div>
          <p v-if="!rol.permisos.length">Sin acceso a módulos operativos; conserva el acceso a su cuenta y al estado del sistema.</p>
          <ul v-else><li v-for="permiso in rol.permisos" :key="permiso">{{ nombrePermiso(permiso) }}</li></ul>
        </article>
      </div>
      <h3>{{ formularioRol.codigo ? `Editar ${formularioRol.nombre}` : 'Crear rol' }}</h3>
      <form @submit.prevent="guardarRol">
        <label>Nombre del rol <span class="requisito-campo">Obligatorio</span>
          <input v-model.trim="formularioRol.nombre" required maxlength="60" placeholder="Ej. Coordinación de citas" />
        </label>
        <fieldset class="permisos-lista">
          <legend>Permisos <span class="requisito-campo">Opcional</span></legend>
          <label v-for="permiso in catalogoPermisos.filter((item) => item.asignable !== false)" :key="permiso.codigo">
            <input v-model="formularioRol.permisos" type="checkbox" :value="permiso.codigo" @change="ajustarDependencias" />
            <span>{{ permiso.nombre }}</span>
          </label>
        </fieldset>
        <p>Para gestionar un módulo también se necesita permiso de consulta; se agrega automáticamente. Administrar usuarios y roles queda reservado al Administrador.</p>
        <div class="acciones">
          <button type="submit" :disabled="guardando">{{ formularioRol.codigo ? 'Guardar rol' : 'Crear rol' }}</button>
          <button v-if="formularioRol.codigo" type="button" class="secundario" @click="descartarEdicionRol">Cancelar edición</button>
        </div>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Crear usuario</h2>
      <form class="formulario-grid formulario-usuarios" @submit.prevent="crear">
        <label>Nombre<input v-model.trim="nuevo.nombre" @input="nuevo.nombre = limpiarNombre($event)" required maxlength="120" placeholder="Solo letras y espacios" /></label>
        <label>Correo electrónico<input v-model.trim="nuevo.correo" type="email" :pattern="patronCorreo" title="Escribe un correo válido, por ejemplo usuario@dominio.com" required autocomplete="off" /></label>
        <label>Rol
          <select v-model="nuevo.rol" class="selector-rol">
            <option v-for="rol in roles" :key="rol.codigo" :value="rol.codigo">{{ rol.nombre }}</option>
          </select>
        </label>
        <div class="campo-password">
          <label for="password-inicial">Contraseña inicial</label>
          <div class="password-control">
            <input id="password-inicial" v-model="nuevo.password" :type="verPasswordInicial ? 'text' : 'password'"
              required minlength="8" maxlength="30" :pattern="patronPassword" autocomplete="new-password"
              aria-describedby="requisitos-password-inicial" />
            <button type="button" class="password-visibilidad" :aria-label="verPasswordInicial ? 'Ocultar contraseña inicial' : 'Ver contraseña inicial'"
              :aria-pressed="verPasswordInicial" @click="verPasswordInicial = !verPasswordInicial">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="verPasswordInicial" d="M3 3l18 18" />
              </svg>
              {{ verPasswordInicial ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
          <ul id="requisitos-password-inicial" class="lista-requisitos-password" aria-label="Requisitos de la contraseña inicial" aria-live="polite">
            <li v-for="requisito in requisitosIniciales" :key="requisito.texto" :class="{ cumplido: requisito.cumplido }">
              <span aria-hidden="true">{{ requisito.cumplido ? '✓' : '○' }}</span>
              {{ requisito.texto }} <span class="solo-lectores">{{ requisito.cumplido ? 'cumplido' : 'pendiente' }}</span>
            </li>
          </ul>
        </div>
        <button type="submit" :disabled="guardando">{{ guardando ? 'Guardando…' : 'Crear usuario' }}</button>
      </form>
    </section>

    <section class="tarjeta">
      <h2>Usuarios registrados</h2>
      <p v-if="cargando">Cargando usuarios…</p>
      <div v-else class="tabla-contenedor">
        <table>
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="usuario in usuarios" :key="usuario.id">
              <td><div class="usuario-identidad"><AvatarUsuario :usuario="usuario" tamano="pequeno" />
                <span>{{ usuario.nombre }}</span></div></td>
              <td>{{ usuario.correo }}</td>
              <td>{{ nombreRol(usuario.rol) }}</td>
              <td>{{ usuario.activo ? 'Activo' : 'Inactivo' }}</td>
              <td>
                <div class="usuario-menu-acciones" @keydown.esc="accionesAbiertas = null">
                  <button type="button" class="secundario usuario-boton-acciones"
                    :aria-expanded="accionesAbiertas === usuario.id" :aria-controls="`acciones-usuario-${usuario.id}`"
                    @click="alternarAcciones(usuario.id)">
                    Acciones
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <div v-show="accionesAbiertas === usuario.id" :id="`acciones-usuario-${usuario.id}`" class="usuario-lista-acciones">
                    <button type="button" @click="verUsuario(usuario)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                      Ver
                    </button>
                    <button type="button" @click="accionesAbiertas = null; editar(usuario)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 16 12-12 4 4-12 12-5 1 1-5Z" /><path d="m14 6 4 4" /></svg>
                      Editar
                    </button>
                    <button type="button" @click="accionesAbiertas = null; prepararRestablecimiento(usuario)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11V7a4 4 0 0 1 8 0v4" /><rect x="3" y="11" width="12" height="10" rx="2" /><path d="M18 9a5 5 0 0 1 2 8M20 9V5m0 4h-4" /></svg>
                      Restablecer contraseña
                    </button>
                    <button type="button" :disabled="usuario.id === sesion.usuario?.id"
                      @click="accionesAbiertas = null; cambiarEstado(usuario)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path v-if="usuario.activo" d="m5.5 5.5 13 13" /><path v-else d="m8 12 3 3 5-6" /></svg>
                      {{ usuario.activo ? 'Desactivar' : 'Activar' }}
                    </button>
                  </div>
                </div>
              </td>
            </tr>
            <tr v-if="!usuarios.length"><td colspan="5">Todavía no hay usuarios registrados.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <dialog ref="dialogoUsuario" class="dialogo-cambios dialogo-detalle-usuario" aria-labelledby="titulo-detalle-usuario">
      <div v-if="usuarioEnDetalle">
        <div class="detalle-usuario-encabezado">
          <h2 id="titulo-detalle-usuario">Detalle del usuario</h2>
          <button type="button" class="secundario" aria-label="Cerrar detalle del usuario" @click="dialogoUsuario?.close()">×</button>
        </div>
        <div class="detalle-usuario-identidad">
          <AvatarUsuario :usuario="usuarioEnDetalle" tamano="mediano" />
          <strong>{{ usuarioEnDetalle.nombre }}</strong>
        </div>
        <dl>
          <div><dt>Correo electrónico</dt><dd>{{ usuarioEnDetalle.correo }}</dd></div>
          <div><dt>Rol</dt><dd>{{ nombreRol(usuarioEnDetalle.rol) }}</dd></div>
          <div><dt>Estado</dt><dd>{{ usuarioEnDetalle.activo ? 'Activo' : 'Inactivo' }}</dd></div>
        </dl>
      </div>
    </dialog>

    <section v-if="edicion" class="tarjeta">
      <h2>Editar usuario</h2>
      <form class="formulario-grid formulario-usuarios" @submit.prevent="guardar">
        <label>Nombre<input v-model.trim="edicion.nombre" @input="edicion.nombre = limpiarNombre($event)" required maxlength="120" placeholder="Solo letras y espacios" /></label>
        <label>Correo electrónico<input v-model.trim="edicion.correo" type="email" :pattern="patronCorreo" title="Escribe un correo válido, por ejemplo usuario@dominio.com" required /></label>
        <label>Rol
          <select v-model="edicion.rol" class="selector-rol" :disabled="edicion.id === sesion.usuario?.id">
            <option v-for="rol in roles" :key="rol.codigo" :value="rol.codigo">{{ rol.nombre }}</option>
          </select>
        </label>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Guardar cambios</button>
          <button type="button" class="secundario" @click="cancelarEdicion">Cancelar</button>
        </div>
      </form>
    </section>

    <section v-if="restablecimiento" class="tarjeta">
      <h2>Restablecer contraseña de {{ restablecimiento.nombre }}</h2>
      <p>Confirma la operación con tu contraseña de administrador. La cuenta deberá iniciar sesión de nuevo.</p>
      <form class="formulario-grid" @submit.prevent="restablecerPassword">
        <div class="campo-password">
          <label for="password-nueva-usuario">Nueva contraseña</label>
          <div class="password-control">
            <input id="password-nueva-usuario" v-model="restablecimiento.passwordNueva"
              :type="verPasswordNueva ? 'text' : 'password'" required minlength="8" maxlength="30"
              :pattern="patronPassword" autocomplete="new-password" aria-describedby="requisitos-password-nueva" />
            <button type="button" class="password-visibilidad" :aria-label="verPasswordNueva ? 'Ocultar nueva contraseña' : 'Ver nueva contraseña'"
              :aria-pressed="verPasswordNueva" @click="verPasswordNueva = !verPasswordNueva">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="verPasswordNueva" d="M3 3l18 18" />
              </svg>
              {{ verPasswordNueva ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
          <ul id="requisitos-password-nueva" class="lista-requisitos-password" aria-label="Requisitos de la nueva contraseña" aria-live="polite">
            <li v-for="requisito in requisitosNuevos" :key="requisito.texto" :class="{ cumplido: requisito.cumplido }">
              <span aria-hidden="true">{{ requisito.cumplido ? '✓' : '○' }}</span>
              {{ requisito.texto }} <span class="solo-lectores">{{ requisito.cumplido ? 'cumplido' : 'pendiente' }}</span>
            </li>
          </ul>
        </div>
        <div class="campo-password">
          <label for="password-admin-actual">Tu contraseña actual</label>
          <div class="password-control">
            <input id="password-admin-actual" v-model="restablecimiento.passwordAdministrador"
              :type="verPasswordAdministrador ? 'text' : 'password'" required autocomplete="current-password" />
            <button type="button" class="password-visibilidad" :aria-label="verPasswordAdministrador ? 'Ocultar contraseña actual' : 'Ver contraseña actual'"
              :aria-pressed="verPasswordAdministrador" @click="verPasswordAdministrador = !verPasswordAdministrador">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                <path v-if="verPasswordAdministrador" d="M3 3l18 18" />
              </svg>
              {{ verPasswordAdministrador ? 'Ocultar' : 'Ver' }}
            </button>
          </div>
        </div>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Restablecer</button>
          <button type="button" class="secundario" @click="cancelarRestablecimiento">Cancelar</button>
        </div>
      </form>
    </section>
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
  </main>
</template>
