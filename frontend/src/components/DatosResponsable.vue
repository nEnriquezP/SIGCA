<script setup>
import { useId } from 'vue'
import ImagenCampo from './ImagenCampo.vue'

const datos = defineModel({ type: Object, required: true })
const idParentescos = useId()
const parentescosComunes = ['Madre', 'Padre', 'Hermano/a', 'Abuelo/a', 'Tío/a', 'Tutor/a legal']

function capturarTelefono(evento) {
  const telefono = evento.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 8)
  evento.target.value = telefono
  datos.value.telefono = telefono
}
</script>

<template>
  <div class="paciente-form-layout">
    <div class="paciente-form-datos">
      <h3>Datos del responsable</h3>
      <div class="paciente-campos">
        <label>Nombres <span class="requisito-campo">Obligatorio</span><input v-model.trim="datos.nombres" required maxlength="120" /></label>
        <label>Apellidos <span class="requisito-campo">Obligatorio</span><input v-model.trim="datos.apellidos" required maxlength="120" /></label>
        <label>Parentesco <span class="requisito-campo">Obligatorio</span>
          <input v-model.trim="datos.parentesco" :list="idParentescos" required maxlength="80" />
          <small>Elige una sugerencia o escribe otro parentesco.</small>
        </label>
        <label>Teléfono <span class="requisito-campo">Obligatorio</span>
          <input :value="datos.telefono" type="tel" inputmode="numeric" autocomplete="tel-national"
            required minlength="8" maxlength="8" pattern="[1-9][0-9]{7}" placeholder="Ej. 55551234"
            title="Escribe 8 números; el primero debe ser de 1 a 9" @input="capturarTelefono" />
          <small>8 dígitos, sin espacios y sin iniciar con 0.</small>
        </label>
        <label class="paciente-campo-ancho">Correo electrónico <span class="requisito-campo">Obligatorio</span>
          <input v-model.trim="datos.correo" type="email" required maxlength="254"
            pattern="[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,63}" placeholder="usuario@dominio.com"
            title="Escribe un correo con el formato usuario@dominio.com" />
        </label>
        <label class="paciente-campo-ancho">Dirección <span class="requisito-campo">Obligatorio</span>
          <input v-model.trim="datos.direccion" required maxlength="300" />
        </label>
      </div>
    </div>
    <ImagenCampo v-model="datos.fotografia" categoria="responsable" etiqueta="Fotografía del responsable"
      obligatoria mostrar-requisito proporcion="1:1" />
  </div>
  <datalist :id="idParentescos">
    <option v-for="parentesco in parentescosComunes" :key="parentesco" :value="parentesco" />
  </datalist>
</template>
