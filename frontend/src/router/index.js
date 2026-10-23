import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/InicioView.vue'
import EstadoView from '../views/EstadoView.vue'
import LoginView from '../views/LoginView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import PacientesView from '../views/PacientesView.vue'
import ResponsablesView from '../views/ResponsablesView.vue'
import CambiarPasswordView from '../views/CambiarPasswordView.vue'
import { useSesionStore } from '../stores/sesion.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'inicio', component: InicioView },
    { path: '/estado', name: 'estado', component: EstadoView },
    { path: '/ingresar', name: 'ingresar', component: LoginView },
    { path: '/mi-password', name: 'mi-password', component: CambiarPasswordView,
      meta: { requiereSesion: true } },
    { path: '/usuarios', name: 'usuarios', component: UsuariosView,
      meta: { requiereSesion: true, rol: 'ADMINISTRADOR' } },
    { path: '/pacientes', name: 'pacientes', component: PacientesView,
      meta: { requiereSesion: true, roles: ['ADMINISTRADOR', 'RECEPCIONISTA'] } },
    { path: '/responsables', name: 'responsables', component: ResponsablesView,
      meta: { requiereSesion: true, roles: ['ADMINISTRADOR', 'RECEPCIONISTA'] } },
  ],
})

router.beforeEach(async (destino) => {
  if (!destino.meta.requiereSesion) return

  const sesion = useSesionStore()
  await sesion.restaurar()
  if (!sesion.autenticado) return { name: 'ingresar' }
  if (destino.meta.rol && sesion.usuario.rol !== destino.meta.rol) return { name: 'inicio' }
  if (destino.meta.roles && !destino.meta.roles.includes(sesion.usuario.rol)) return { name: 'inicio' }
})

export default router
