import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/InicioView.vue'
import EstadoView from '../views/EstadoView.vue'
import LoginView from '../views/LoginView.vue'
import UsuariosView from '../views/UsuariosView.vue'
import PacientesView from '../views/PacientesView.vue'
import ResponsablesView from '../views/ResponsablesView.vue'
import CambiarPasswordView from '../views/CambiarPasswordView.vue'
import ServiciosView from '../views/ServiciosView.vue'
import HorariosView from '../views/HorariosView.vue'
import ContenidoPublicoView from '../views/ContenidoPublicoView.vue'
import ContactoView from '../views/ContactoView.vue'
import AdministracionPortalView from '../views/AdministracionPortalView.vue'
import SolicitudCitaView from '../views/SolicitudCitaView.vue'
import GestionSolicitudesView from '../views/GestionSolicitudesView.vue'
import { useSesionStore } from '../stores/sesion.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'inicio', component: InicioView },
    { path: '/estado', name: 'estado', component: EstadoView },
    { path: '/ingresar', name: 'ingresar', component: LoginView },
    { path: '/servicios', name: 'servicios', component: ServiciosView,
      props: { administracion: false } },
    { path: '/solicitar-cita', name: 'solicitar-cita', component: SolicitudCitaView },
    { path: '/gestion-solicitudes', name: 'gestion-solicitudes',
      component: GestionSolicitudesView,
      meta: { requiereSesion: true, roles: ['ADMINISTRADOR', 'RECEPCIONISTA'] } },
    { path: '/gestion-servicios', name: 'gestion-servicios', component: ServiciosView,
      props: { administracion: true },
      meta: { requiereSesion: true, roles: ['ADMINISTRADOR', 'RECEPCIONISTA'] } },
    { path: '/horarios', name: 'horarios', component: HorariosView,
      props: { administracion: false } },
    { path: '/educacion', name: 'educacion', component: ContenidoPublicoView,
      props: { tipo: 'educacion' } },
    { path: '/corporativo', name: 'corporativo', component: ContenidoPublicoView,
      props: { tipo: 'corporativo' } },
    { path: '/contacto', name: 'contacto', component: ContactoView },
    { path: '/administracion-portal', name: 'administracion-portal',
      component: AdministracionPortalView,
      meta: { requiereSesion: true, rol: 'ADMINISTRADOR' } },
    { path: '/gestion-horarios', name: 'gestion-horarios', component: HorariosView,
      props: { administracion: true },
      meta: { requiereSesion: true, roles: ['ADMINISTRADOR', 'RECEPCIONISTA'] } },
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
