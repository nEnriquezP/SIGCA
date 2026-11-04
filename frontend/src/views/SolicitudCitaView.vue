<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { solicitarApi } from '../services/api.js'
import { avisoEspera, diasHasta, fechaMaximaGuatemala, hoyGuatemala } from '../utils/fechasCita.js'
import { mostrarError } from '../services/avisos.js'
import { useOpcionesVivas } from '../composables/useOpcionesVivas.js'
import { correoSolicitudValido, limpiarTelefonoSolicitud, requisitosCorreoSolicitud,
  requisitosTelefonoSolicitud, telefonoSolicitudValido } from '../utils/validacionSolicitud.js'

const route = useRoute()
const servicios = ref([])
const formulario = ref(vacio())
const cargando = ref(true)
const enviando = ref(false)
const error = ref('')
const confirmacion = ref(null)
const avisoOpciones = ref('')
const enviandoCodigo = ref(false)
const verificacionId = ref('')
const correoDelCodigo = ref('')
const codigoVerificacion = ref('')
const avisoCodigo = ref('')
const requisitosCorreo = computed(() => requisitosCorreoSolicitud(formulario.value.correo))
const requisitosTelefono = computed(() => requisitosTelefonoSolicitud(formulario.value.telefono))

function vacio() {
  return { nombreSolicitante: '', correo: '', telefono: '', servicio: '',
    fechaPreferida: '', mensajeAdicional: '', recibirPublicaciones: false }
}

watch(() => formulario.value.correo, (correo) => {
  if (correo.trim().toLowerCase() === correoDelCodigo.value) return
  verificacionId.value = ''
  codigoVerificacion.value = ''
  avisoCodigo.value = ''
})

function capturarTelefono(evento) {
  const limpio = limpiarTelefonoSolicitud(evento.target.value)
  evento.target.value = limpio
  formulario.value.telefono = limpio
}

function capturarCodigo(evento) {
  const limpio = evento.target.value.replace(/\D/g, '').slice(0, 6)
  evento.target.value = limpio
  codigoVerificacion.value = limpio
}

async function enviarCodigo() {
  error.value = ''
  if (!correoSolicitudValido(formulario.value.correo)) {
    error.value = 'Completa el correo con la estructura nombre@dominio.com antes de pedir el código.'
    mostrarError(error.value, 'correo')
    return
  }
  const correo = formulario.value.correo.trim().toLowerCase()
  enviandoCodigo.value = true
  avisoCodigo.value = ''
  try {
    const respuesta = await solicitarApi('/api/solicitudes-cita/enviar-codigo', {
      method: 'POST', body: { correo },
    })
    if (formulario.value.correo.trim().toLowerCase() !== correo) {
      avisoCodigo.value = 'El correo cambió mientras se enviaba el código. Solicita uno nuevo.'
      return
    }
    verificacionId.value = respuesta.verificacionId
    correoDelCodigo.value = correo
    codigoVerificacion.value = ''
    avisoCodigo.value = respuesta.mensaje
  } catch (fallo) {
    error.value = fallo.message || 'No se pudo enviar el código.'
  } finally {
    enviandoCodigo.value = false
  }
}

function otraSolicitud() {
  confirmacion.value = null
  error.value = ''
}

async function cargar(inicial = false) {
  if (inicial) cargando.value = true
  error.value = ''
  try {
    servicios.value = (await solicitarApi('/api/servicios/opciones', { silencioso: !inicial })).servicios
    const sugerido = typeof route.query.servicio === 'string' ? route.query.servicio : ''
    if (inicial) formulario.value.servicio = servicios.value.some((s) => s.id === sugerido) ? sugerido : ''
    else if (formulario.value.servicio && !servicios.value.some((s) => s.id === formulario.value.servicio)) {
      formulario.value.servicio = ''
      avisoOpciones.value = 'El servicio seleccionado ya no está activo. Elige otro.'
    }
  } catch (fallo) {
    if (inicial) error.value = fallo.message
  } finally {
    if (inicial) cargando.value = false
  }
}

async function enviar() {
  error.value = ''
  confirmacion.value = null
  const datos = Object.fromEntries(Object.entries(formulario.value).map(([clave, valor]) =>
    [clave, typeof valor === 'string' ? valor.trim() : valor]))
  if (!datos.nombreSolicitante || datos.nombreSolicitante.length > 120) {
    error.value = 'Escribe el nombre del solicitante (máximo 120 caracteres).'
    mostrarError(error.value, 'nombreSolicitante')
    return
  }
  if (!correoSolicitudValido(datos.correo)) {
    error.value = 'El correo debe tener la estructura nombre@dominio.com. Revisa los requisitos debajo del campo.'
    mostrarError(error.value, 'correo')
    return
  }
  if (!telefonoSolicitudValido(datos.telefono)) {
    error.value = 'El teléfono debe tener exactamente 8 dígitos y no comenzar con 0.'
    mostrarError(error.value, 'telefono')
    return
  }
  if (!verificacionId.value || correoDelCodigo.value !== datos.correo.toLowerCase() ||
      !/^\d{6}$/.test(codigoVerificacion.value)) {
    error.value = 'Solicita e ingresa el código de seis dígitos enviado a este correo.'
    mostrarError(error.value, 'codigoVerificacion')
    return
  }
  if (!servicios.value.some((s) => s.id === datos.servicio) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(datos.fechaPreferida) ||
      diasHasta(datos.fechaPreferida) === null || diasHasta(datos.fechaPreferida) < 0 ||
      diasHasta(datos.fechaPreferida) > 365 || datos.mensajeAdicional.length > 2000) {
    error.value = 'Revisa el servicio activo y la fecha preferida entre hoy y los próximos 365 días.'
    mostrarError(error.value, 'fechaPreferida')
    return
  }
  enviando.value = true
  try {
    const respuesta = await solicitarApi('/api/solicitudes-cita', { method: 'POST',
      body: { ...datos, verificacionId: verificacionId.value,
        codigoVerificacion: codigoVerificacion.value } })
    confirmacion.value = respuesta
    formulario.value = vacio()
    verificacionId.value = ''
    correoDelCodigo.value = ''
    codigoVerificacion.value = ''
    avisoCodigo.value = ''
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    enviando.value = false
  }
}

onMounted(() => cargar(true))
useOpcionesVivas(() => cargar(false), ['servicios'])
</script>

<template>
  <main class="contenedor portal-pagina portal-solicitud">
    <header class="portal-pagina-encabezado">
      <span class="portal-etiqueta">Primer paso para acompañarte</span>
      <h1>Solicita tu cita</h1>
      <p>Cuéntanos cómo podemos ayudarte. El centro revisará tu solicitud y se comunicará contigo por el correo verificado.</p>
    </header>
    <p v-if="cargando" role="status">Cargando servicios activos…</p>
    <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
    <p v-if="avisoOpciones" class="mensaje-error" role="status">{{ avisoOpciones }}</p>
    <button v-if="error && !servicios.length" type="button" class="secundario" @click="cargar">Reintentar</button>
    <section v-if="confirmacion" class="portal-solicitud-confirmacion" role="status">
      <span class="portal-confirmacion-icono" aria-hidden="true">✓</span>
      <h2>Solicitud recibida</h2>
      <p>{{ confirmacion.mensaje }}</p>
      <div class="portal-solicitud-codigo"><small>Identificador para consultar con el centro</small><strong>{{ confirmacion.solicitud.codigo || 'Pendiente de actualización' }}</strong></div>
      <p>Estado: <strong>{{ confirmacion.solicitud.estado }}</strong></p>
      <button type="button" class="secundario" @click="otraSolicitud">Crear otra solicitud</button>
    </section>
    <div v-if="!cargando && !confirmacion" class="portal-solicitud-layout">
      <aside class="portal-solicitud-guia">
        <span class="portal-etiqueta">Así funciona</span>
        <h2>Un proceso sencillo y seguro</h2>
        <ol>
          <li><span>01</span><div><strong>Comparte tus datos</strong><p>Indica cómo podemos comunicarnos contigo.</p></div></li>
          <li><span>02</span><div><strong>Verifica tu correo</strong><p>Te enviaremos un código para confirmar que puedes recibir avisos.</p></div></li>
          <li><span>03</span><div><strong>Elige tu preferencia</strong><p>Selecciona servicio y fecha para que el centro revise tu solicitud.</p></div></li>
        </ol>
        <div class="portal-solicitud-aviso"><strong>Ten en cuenta</strong><p>La fecha solicitada es una preferencia. Enviar el formulario no confirma una cita ni reserva un horario.</p></div>
      </aside>
      <section class="portal-solicitud-formulario">
        <p v-if="!servicios.length">No hay servicios activos disponibles para solicitar.</p>
        <form v-else novalidate @submit.prevent="enviar">
          <div class="solicitud-grupo">
            <div class="solicitud-grupo-titulo"><span>01</span><div><h2>Tus datos de contacto</h2><p>Necesitamos saber cómo comunicarnos contigo.</p></div></div>
            <label>Nombre del solicitante <span class="requisito-campo">Obligatorio</span><input v-model="formulario.nombreSolicitante" data-campo="nombreSolicitante" required maxlength="120" autocomplete="name" placeholder="Escribe tu nombre completo" /></label>
            <label>Teléfono <span class="requisito-campo">Obligatorio</span>
              <input :value="formulario.telefono" data-campo="telefono" type="tel" inputmode="numeric"
                autocomplete="tel-national" required minlength="8" maxlength="8" pattern="[1-9][0-9]{7}"
                placeholder="Ej. 79223344" aria-describedby="requisitos-telefono-solicitud" @input="capturarTelefono" />
            </label>
            <ul id="requisitos-telefono-solicitud" class="lista-requisitos-contacto" aria-label="Requisitos del teléfono" aria-live="polite">
              <li v-for="requisito in requisitosTelefono" :key="requisito.texto" :class="{ cumplido: requisito.cumplido }">
                <span aria-hidden="true">{{ requisito.cumplido ? '✓' : '○' }}</span>
                <span class="solo-lectores">{{ requisito.cumplido ? 'Cumplido: ' : 'Falta: ' }}</span>{{ requisito.texto }}
              </li>
            </ul>
          </div>
          <div class="solicitud-grupo">
            <div class="solicitud-grupo-titulo"><span>02</span><div><h2>Verifica tu correo</h2><p>Aquí recibirás los avisos sobre tu solicitud.</p></div></div>
            <label>Correo electrónico <span class="requisito-campo">Obligatorio</span>
              <input v-model="formulario.correo" data-campo="correo" type="email" required maxlength="254"
                autocomplete="email" placeholder="nombre@dominio.com" aria-describedby="requisitos-correo-solicitud" />
            </label>
            <ul id="requisitos-correo-solicitud" class="lista-requisitos-contacto" aria-label="Estructura esperada del correo" aria-live="polite">
              <li v-for="requisito in requisitosCorreo" :key="requisito.texto" :class="{ cumplido: requisito.cumplido }">
                <span aria-hidden="true">{{ requisito.cumplido ? '✓' : '○' }}</span>
                <span class="solo-lectores">{{ requisito.cumplido ? 'Cumplido: ' : 'Falta: ' }}</span>{{ requisito.texto }}
              </li>
            </ul>
            <p class="solicitud-ayuda">Antes de registrar la solicitud, enviaremos un código a este correo para comprobar que puedes recibir mensajes.</p>
            <button type="button" class="secundario solicitud-codigo-boton" :disabled="enviandoCodigo || enviando" @click="enviarCodigo">
              {{ enviandoCodigo ? 'Enviando código…' : 'Enviar código al correo' }}
            </button>
            <p v-if="avisoCodigo" class="mensaje-exito" role="status">{{ avisoCodigo }}</p>
            <label v-if="verificacionId">Código recibido <span class="requisito-campo">Obligatorio</span>
              <input :value="codigoVerificacion" data-campo="codigoVerificacion" type="text" inputmode="numeric"
                autocomplete="one-time-code" required minlength="6" maxlength="6" pattern="[0-9]{6}"
                placeholder="6 dígitos" @input="capturarCodigo" />
              <small>El código vence en 10 minutos y se puede usar una sola vez.</small>
            </label>
          </div>
          <div class="solicitud-grupo">
            <div class="solicitud-grupo-titulo"><span>03</span><div><h2>Tu cita preferida</h2><p>El centro confirmará la disponibilidad después de revisar tu solicitud.</p></div></div>
            <label>Servicio solicitado <span class="requisito-campo">Obligatorio</span><select v-model="formulario.servicio" data-campo="servicio" required>
              <option disabled value="">Selecciona un servicio activo</option>
              <option v-for="servicio in servicios" :key="servicio.id" :value="servicio.id">{{ servicio.nombre }}</option>
            </select></label>
            <label>Fecha preferida <span class="requisito-campo">Obligatorio</span>
              <input v-model="formulario.fechaPreferida" data-campo="fechaPreferida" type="date"
                :min="hoyGuatemala()" :max="fechaMaximaGuatemala()" required />
              <small v-if="formulario.fechaPreferida" role="status">{{ avisoEspera(formulario.fechaPreferida) }}</small></label>
            <label>Mensaje adicional <span class="requisito-campo">Opcional</span><textarea v-model="formulario.mensajeAdicional" maxlength="2000" placeholder="¿Hay algo más que debamos saber?" /></label>
            <label class="solicitud-opcional"><input v-model="formulario.recibirPublicaciones" type="checkbox" /> <span>Deseo recibir publicaciones del portal cuando mi correo esté vinculado y verificado como paciente o responsable (opcional).</span></label>
            <small>El personal confirmará esta preferencia al registrar el contacto. Los avisos de la solicitud se enviarán al correo verificado de este formulario.</small>
          </div>
          <div class="solicitud-envio"><button type="submit" :disabled="enviando">{{ enviando ? 'Enviando…' : 'Enviar solicitud' }} <span aria-hidden="true">↗</span></button><small>Revisa tus datos antes de enviar.</small></div>
        </form>
      </section>
    </div>
  </main>
</template>
