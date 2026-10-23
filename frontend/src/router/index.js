import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/InicioView.vue'
import EstadoView from '../views/EstadoView.vue'
import LoginView from '../views/LoginView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import { useSesionStore } from '../stores/sesion.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'inicio', component: InicioView },
    { path: '/estado', name: 'estado', component: EstadoView },
    { path: '/ingresar', name: 'ingresar', component: LoginView },
    { path: '/usuarios', name: 'usuarios', component: UsuariosView,
      meta: { requiereSesion: true, rol: 'ADMINISTRADOR' } },
  ],
})

router.beforeEach(async (destino) => {
  if (!destino.meta.requiereSesion) return

  const sesion = useSesionStore()
  await sesion.restaurar()
  if (!sesion.autenticado) return { name: 'ingresar' }
  if (destino.meta.rol && sesion.usuario.rol !== destino.meta.rol) return { name: 'inicio' }
})

export default router
