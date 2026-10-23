<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'

const router = useRouter()
const sesion = useSesionStore()
const usuarios = ref([])
const error = ref('')
const aviso = ref('')
const cargando = ref(false)
const guardando = ref(false)
const nuevo = ref({ nombre: '', correo: '', rol: 'RECEPCIONISTA', password: '' })
const edicion = ref(null)
const restablecimiento = ref(null)
const roles = ['ADMINISTRADOR', 'RECEPCIONISTA', 'PROFESIONAL']

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
    aviso.value = 'Usuario creado'
    await cargar()
  } catch (fallo) {
    manejarError(fallo)
  } finally {
    guardando.value = false
  }
}

function editar(usuario) {
  edicion.value = { ...usuario }
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

function prepararRestablecimiento(usuario) {
  restablecimiento.value = { id: usuario.id, nombre: usuario.nombre,
    passwordNueva: '', passwordAdministrador: '' }
  edicion.value = null
  error.value = ''
  aviso.value = ''
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

onMounted(cargar)
</script>

<template>
  <main class="contenedor">
    <h1>Usuarios</h1>
    <p>Solo los administradores pueden crear y administrar cuentas.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section class="tarjeta">
      <h2>Crear usuario</h2>
      <form class="formulario-grid" @submit.prevent="crear">
        <label>Nombre<input v-model.trim="nuevo.nombre" required maxlength="120" /></label>
        <label>Correo<input v-model.trim="nuevo.correo" type="email" required autocomplete="off" /></label>
        <label>Rol
          <select v-model="nuevo.rol">
            <option v-for="rol in roles" :key="rol" :value="rol">{{ rol }}</option>
          </select>
        </label>
        <label>Contraseña inicial
          <input v-model="nuevo.password" type="password" required minlength="12" autocomplete="new-password" />
        </label>
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
              <td>{{ usuario.nombre }}</td>
              <td>{{ usuario.correo }}</td>
              <td>{{ usuario.rol }}</td>
              <td>{{ usuario.activo ? 'Activo' : 'Inactivo' }}</td>
              <td class="acciones">
                <button type="button" class="secundario" @click="editar(usuario)">Editar</button>
                <button type="button" class="secundario" @click="prepararRestablecimiento(usuario)">Restablecer contraseña</button>
                <button type="button" class="secundario" :disabled="usuario.id === sesion.usuario?.id"
                  @click="cambiarEstado(usuario)">
                  {{ usuario.activo ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
            <tr v-if="!usuarios.length"><td colspan="5">Todavía no hay usuarios registrados.</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="edicion" class="tarjeta">
      <h2>Editar usuario</h2>
      <form class="formulario-grid" @submit.prevent="guardar">
        <label>Nombre<input v-model.trim="edicion.nombre" required maxlength="120" /></label>
        <label>Correo<input v-model.trim="edicion.correo" type="email" required /></label>
        <label>Rol
          <select v-model="edicion.rol" :disabled="edicion.id === sesion.usuario?.id">
            <option v-for="rol in roles" :key="rol" :value="rol">{{ rol }}</option>
          </select>
        </label>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Guardar cambios</button>
          <button type="button" class="secundario" @click="edicion = null">Cancelar</button>
        </div>
      </form>
    </section>

    <section v-if="restablecimiento" class="tarjeta">
      <h2>Restablecer contraseña de {{ restablecimiento.nombre }}</h2>
      <p>Confirma la operación con tu contraseña de administrador. La cuenta deberá iniciar sesión de nuevo.</p>
      <form class="formulario-grid" @submit.prevent="restablecerPassword">
        <label>Nueva contraseña
          <input v-model="restablecimiento.passwordNueva" type="password" required minlength="12" autocomplete="new-password" />
        </label>
        <label>Tu contraseña actual
          <input v-model="restablecimiento.passwordAdministrador" type="password" required autocomplete="current-password" />
        </label>
        <div class="acciones">
          <button type="submit" :disabled="guardando">Restablecer</button>
          <button type="button" class="secundario" @click="restablecimiento = null">Cancelar</button>
        </div>
      </form>
    </section>
  </main>
</template>
