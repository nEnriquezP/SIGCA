<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import { useCambiosSinGuardar } from '../composables/useCambiosSinGuardar.js'
import AdvertenciaCambios from '../components/AdvertenciaCambios.vue'
import ImagenCampo from '../components/ImagenCampo.vue'
import AvatarUsuario from '../components/AvatarUsuario.vue'
import { avatares } from '../data/avatares.js'

const router = useRouter()
const sesion = useSesionStore()
const formulario = ref({ avatar: '', fotografia: '' })
const original = ref(JSON.stringify(formulario.value))
const guardando = ref(false)
const error = ref('')
const aviso = ref('')
const hayCambios = computed(() => JSON.stringify(formulario.value) !== original.value)
const { advertenciaVisible, seguirEditando, salirSinGuardar } = useCambiosSinGuardar(hayCambios)

onMounted(() => {
  formulario.value = { avatar: sesion.usuario?.avatar || '', fotografia: sesion.usuario?.fotografia || '' }
  original.value = JSON.stringify(formulario.value)
})

function seleccionarAvatar(id) {
  formulario.value = { avatar: id, fotografia: '' }
  aviso.value = ''
}

function seleccionarFoto(valor) {
  formulario.value = { avatar: '', fotografia: valor }
  aviso.value = ''
}

async function guardar() {
  guardando.value = true
  error.value = ''
  aviso.value = ''
  try {
    const datos = await solicitarApi('/api/auth/perfil', {
      method: 'PUT', token: sesion.token, body: formulario.value,
    })
    sesion.actualizarUsuario(datos.usuario)
    original.value = JSON.stringify(formulario.value)
    aviso.value = 'Tu perfil se guardó correctamente'
  } catch (fallo) {
    if (fallo.status === 401) {
      sesion.cerrar()
      router.push({ name: 'ingresar' })
    }
    error.value = fallo.message || 'No se pudo guardar el perfil'
  } finally {
    guardando.value = false
  }
}
</script>

<template>
  <main class="contenedor">
    <h1>Mi cuenta</h1>
    <p>Elige una fotografía propia o un avatar. Si no eliges ninguno, se mostrará una silueta gris.</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="aviso" class="mensaje-exito" role="status">{{ aviso }}</p>

    <section class="tarjeta perfil-resumen">
      <AvatarUsuario :usuario="sesion.usuario" tamano="grande" />
      <div>
        <h2>{{ sesion.usuario?.nombre }}</h2>
        <p>{{ sesion.usuario?.correo }}</p>
        <p>Rol: {{ sesion.usuario?.rol }}</p>
      </div>
    </section>

    <form class="tarjeta formulario-mi-cuenta" @submit.prevent="guardar">
      <h2>Imagen de perfil</h2>
      <p>Puedes elegir una imagen del equipo o usar la cámara del teléfono o de la computadora si el navegador lo permite. Antes de guardarla podrás recortarla.</p>
      <ImagenCampo :model-value="formulario.fotografia" categoria="usuario" etiqueta="Fotografía de perfil"
        proporcion="1:1" @update:model-value="seleccionarFoto" />
      <h3>O elige un avatar <span class="requisito-campo">Opcional</span></h3>
      <div class="opciones-avatar" role="group" aria-label="Avatares disponibles">
        <button v-for="opcion in avatares" :key="opcion.id" type="button" class="opcion-avatar"
          :class="{ elegido: formulario.avatar === opcion.id }" :aria-pressed="formulario.avatar === opcion.id"
          @click="seleccionarAvatar(opcion.id)">
          <AvatarUsuario :usuario="{ avatar: opcion.id }" tamano="mediano" />
          <span>{{ opcion.nombre }}</span>
        </button>
      </div>
      <button v-if="formulario.avatar || formulario.fotografia" type="button" class="secundario"
        @click="seleccionarAvatar('')">Usar avatar gris</button>
      <div class="acciones">
        <button type="submit" :disabled="guardando || !hayCambios">{{ guardando ? 'Guardando…' : 'Guardar mi cuenta' }}</button>
      </div>
    </form>
    <AdvertenciaCambios :abierto="advertenciaVisible" @seguir="seguirEditando" @salir="salirSinGuardar" />
  </main>
</template>
