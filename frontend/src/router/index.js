import { createRouter, createWebHistory } from 'vue-router'
import InicioView from '../views/InicioView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [{ path: '/', name: 'inicio', component: InicioView }],
})
