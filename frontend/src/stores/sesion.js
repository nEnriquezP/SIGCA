import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { solicitarApi } from '../services/api.js'

const CLAVE_SESION = 'sigca_token'

export const useSesionStore = defineStore('sesion', () => {
  const token = ref(sessionStorage.getItem(CLAVE_SESION) || '')
  const usuario = ref(null)
  const comprobada = ref(false)
  const autenticado = computed(() => Boolean(token.value && usuario.value))

  function cerrar() {
    token.value = ''
    usuario.value = null
    comprobada.value = true
    sessionStorage.removeItem(CLAVE_SESION)
  }

  async function iniciar(correo, password) {
    const datos = await solicitarApi('/api/auth/login', {
      method: 'POST',
      body: { correo, password },
    })
    token.value = datos.token
    usuario.value = datos.usuario
    comprobada.value = true
    sessionStorage.setItem(CLAVE_SESION, datos.token)
  }

  async function restaurar() {
    if (comprobada.value) return
    if (!token.value) {
      comprobada.value = true
      return
    }

    try {
      const datos = await solicitarApi('/api/auth/me', { token: token.value })
      usuario.value = datos.usuario
    } catch {
      cerrar()
    } finally {
      comprobada.value = true
    }
  }

  return { token, usuario, autenticado, iniciar, restaurar, cerrar }
})
