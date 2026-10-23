import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/InicioView.vue'
import EstadoView from '../views/EstadoView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'inicio', component: InicioView },
    { path: '/estado', name: 'estado', component: EstadoView },
  ],
})
