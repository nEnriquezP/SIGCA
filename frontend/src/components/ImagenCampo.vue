<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { obtenerImagenPrivada, subirArchivoImagen } from '../services/api.js'
import { useSesionStore } from '../stores/sesion.js'
import ImagenVista from './ImagenVista.vue'
import { errorActual, mostrarError } from '../services/avisos.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  categoria: { type: String, required: true },
  etiqueta: { type: String, required: true },
  obligatoria: { type: Boolean, default: false },
  mostrarRequisito: { type: Boolean, default: true },
  proporcion: { type: String, default: '4:3' },
})
const emit = defineEmits(['update:modelValue'])
const sesion = useSesionStore()
const archivoInput = ref(null)
const camaraInput = ref(null)
const dialogo = ref(null)
const dialogoCamara = ref(null)
const videoCamara = ref(null)
let camaraStream = null
const lienzo = ref(null)
const imagen = ref(null)
const fuenteTemporal = ref('')
const vistaLocal = ref('')
const ultimoValor = ref('')
const zoom = ref(1)
const horizontal = ref(0)
const vertical = ref(0)
const cargando = ref(false)
const error = ref('')
const arrastre = ref(null)
const [proporcionAncho, proporcionAlto] = props.proporcion.split(':').map(Number)
const ancho = 600
const alto = Math.round(ancho * proporcionAlto / proporcionAncho)
const tieneValor = computed(() => Boolean(props.modelValue))

watch(() => props.modelValue, (valor) => {
  if (valor !== ultimoValor.value && vistaLocal.value) {
    URL.revokeObjectURL(vistaLocal.value)
    vistaLocal.value = ''
  }
})
watch(error, (mensaje) => {
  if (mensaje && errorActual.value?.mensaje !== mensaje) mostrarError(mensaje)
})
watch([zoom, horizontal, vertical], dibujar)
onUnmounted(() => {
  cerrarCamara()
  if (fuenteTemporal.value) URL.revokeObjectURL(fuenteTemporal.value)
  if (vistaLocal.value) URL.revokeObjectURL(vistaLocal.value)
})

function cerrarCamara() {
  camaraStream?.getTracks().forEach((pista) => pista.stop())
  camaraStream = null
  if (videoCamara.value) videoCamara.value.srcObject = null
  if (dialogoCamara.value?.open) dialogoCamara.value.close()
}

async function usarCamara() {
  error.value = ''
  if (!navigator.mediaDevices?.getUserMedia) {
    camaraInput.value?.click()
    return
  }
  try {
    camaraStream = await navigator.mediaDevices.getUserMedia({
      audio: false, video: { facingMode: 'user' },
    })
    await nextTick()
    videoCamara.value.srcObject = camaraStream
    dialogoCamara.value.showModal()
    await videoCamara.value.play()
  } catch {
    cerrarCamara()
    error.value = 'No se pudo abrir la cámara. Revisa sus permisos o usa Elegir imagen.'
  }
}

async function tomarFoto() {
  const video = videoCamara.value
  if (!video?.videoWidth || !video.videoHeight) {
    error.value = 'Espera a que la cámara muestre una imagen.'
    return
  }
  try {
    const captura = document.createElement('canvas')
    captura.width = video.videoWidth
    captura.height = video.videoHeight
    captura.getContext('2d').drawImage(video, 0, 0)
    const blob = await new Promise((resolver) => captura.toBlob(resolver, 'image/jpeg', 0.9))
    if (!blob) throw new Error('No se pudo tomar la fotografía')
    cerrarCamara()
    await abrirConBlob(blob)
  } catch {
    error.value = 'No se pudo procesar la foto. Inténtalo de nuevo.'
  }
}

function dibujar() {
  const canvas = lienzo.value
  const foto = imagen.value
  if (!canvas || !foto) return
  const contexto = canvas.getContext('2d')
  const escala = Math.max(ancho / foto.naturalWidth, alto / foto.naturalHeight) * zoom.value
  const dibujadoAncho = foto.naturalWidth * escala
  const dibujadoAlto = foto.naturalHeight * escala
  const x = (ancho - dibujadoAncho) / 2 + horizontal.value / 100 * (dibujadoAncho - ancho) / 2
  const y = (alto - dibujadoAlto) / 2 + vertical.value / 100 * (dibujadoAlto - alto) / 2
  contexto.clearRect(0, 0, ancho, alto)
  contexto.drawImage(foto, x, y, dibujadoAncho, dibujadoAlto)
}

function iniciarArrastre(evento) {
  if (!imagen.value || cargando.value) return
  arrastre.value = { x: evento.clientX, y: evento.clientY,
    horizontal: horizontal.value, vertical: vertical.value }
  evento.currentTarget.setPointerCapture(evento.pointerId)
}

function moverArrastre(evento) {
  if (!arrastre.value || !imagen.value || !lienzo.value) return
  const foto = imagen.value
  const escala = Math.max(ancho / foto.naturalWidth, alto / foto.naturalHeight) * zoom.value
  const sobranteX = foto.naturalWidth * escala - ancho
  const sobranteY = foto.naturalHeight * escala - alto
  const escalaPantalla = ancho / lienzo.value.getBoundingClientRect().width
  const limitar = (valor) => Math.max(-100, Math.min(100, valor))
  horizontal.value = sobranteX > 0 ? limitar(arrastre.value.horizontal +
    (evento.clientX - arrastre.value.x) * escalaPantalla * 200 / sobranteX) : 0
  vertical.value = sobranteY > 0 ? limitar(arrastre.value.vertical +
    (evento.clientY - arrastre.value.y) * escalaPantalla * 200 / sobranteY) : 0
}

function terminarArrastre() {
  arrastre.value = null
}

async function abrirConBlob(blob) {
  if (fuenteTemporal.value) URL.revokeObjectURL(fuenteTemporal.value)
  fuenteTemporal.value = URL.createObjectURL(blob)
  const foto = new Image()
  foto.src = fuenteTemporal.value
  await foto.decode()
  imagen.value = foto
  zoom.value = 1
  horizontal.value = 0
  vertical.value = 0
  await nextTick()
  dialogo.value.showModal()
  dibujar()
}

async function seleccionar(evento) {
  const archivo = evento.target.files?.[0]
  evento.target.value = ''
  if (!archivo) return
  error.value = ''
  if (archivo.size > 5 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
    error.value = 'Elige una imagen JPEG, PNG o WebP de hasta 5 MB.'
    return
  }
  try {
    await abrirConBlob(archivo)
  } catch {
    error.value = 'No se pudo abrir esta imagen. Prueba con otra.'
  }
}

async function recortarActual() {
  if (!props.modelValue) return
  error.value = ''
  try {
    let blob
    if (vistaLocal.value && ultimoValor.value === props.modelValue) {
      blob = await (await fetch(vistaLocal.value)).blob()
    } else if (props.modelValue.startsWith('/api/imagenes/privadas/')) {
      blob = await obtenerImagenPrivada(props.modelValue, sesion.token)
    } else {
      const respuesta = await fetch(props.modelValue, { mode: 'cors' })
      if (!respuesta.ok) throw new Error('No disponible')
      blob = await respuesta.blob()
    }
    await abrirConBlob(blob)
  } catch {
    error.value = 'El origen de esta imagen no permite recortarla en el navegador. Usa Reemplazar para elegir un archivo.'
  }
}

function cancelar() {
  terminarArrastre()
  dialogo.value?.close()
  imagen.value = null
  if (fuenteTemporal.value) URL.revokeObjectURL(fuenteTemporal.value)
  fuenteTemporal.value = ''
}

async function confirmar() {
  if (!lienzo.value || cargando.value) return
  cargando.value = true
  error.value = ''
  try {
    const blob = await new Promise((resolver) => lienzo.value.toBlob(resolver, 'image/jpeg', 0.85))
    if (!blob) throw new Error('No se pudo recortar la imagen')
    const valor = await subirArchivoImagen(props.categoria, blob, sesion.token)
    if (vistaLocal.value) URL.revokeObjectURL(vistaLocal.value)
    vistaLocal.value = URL.createObjectURL(blob)
    ultimoValor.value = valor
    emit('update:modelValue', valor)
    cancelar()
  } catch (fallo) {
    error.value = fallo.message || 'No se pudo cargar la imagen'
  } finally {
    cargando.value = false
  }
}

function quitar() {
  if (vistaLocal.value) URL.revokeObjectURL(vistaLocal.value)
  vistaLocal.value = ''
  ultimoValor.value = ''
  emit('update:modelValue', '')
  error.value = ''
}
</script>

<template>
  <fieldset class="campo-imagen">
    <legend>{{ etiqueta }}<span v-if="mostrarRequisito" class="requisito-campo">{{ obligatoria ? 'Obligatorio' : 'Opcional' }}</span><template v-else>{{ obligatoria ? ' (obligatoria)' : ' (opcional)' }}</template></legend>
    <img v-if="vistaLocal" class="vista-previa-imagen" :src="vistaLocal" :alt="`Vista previa de ${etiqueta}`" />
    <ImagenVista v-else-if="tieneValor" :valor="modelValue" :alt="etiqueta" />
    <p v-else>No hay imagen seleccionada.</p>
    <div class="acciones">
      <button v-if="tieneValor" type="button" class="secundario" @click="recortarActual">Recortar</button>
      <button type="button" class="secundario" @click="archivoInput.click()">{{ tieneValor ? 'Reemplazar' : 'Elegir imagen' }}</button>
      <button type="button" class="secundario" @click="usarCamara">Usar cámara</button>
      <button v-if="tieneValor" type="button" class="secundario" @click="quitar">Quitar</button>
    </div>
    <input ref="archivoInput" class="entrada-archivo-oculta" type="file" tabindex="-1" accept="image/jpeg,image/png,image/webp" :aria-label="`Elegir ${etiqueta}`" @change="seleccionar" />
    <input ref="camaraInput" class="entrada-archivo-oculta" type="file" tabindex="-1" accept="image/jpeg,image/png,image/webp" capture="user" :aria-label="`Fotografiar ${etiqueta}`" @change="seleccionar" />
    <p v-if="error && !imagen" class="mensaje-error" role="alert">{{ error }}</p>
    <dialog ref="dialogoCamara" class="dialogo-recorte dialogo-camara" :aria-label="`Tomar ${etiqueta}`"
      @cancel.prevent="cerrarCamara">
      <h3>Tomar {{ etiqueta }}</h3>
      <video ref="videoCamara" autoplay playsinline muted aria-label="Vista previa de la cámara"></video>
      <div class="acciones">
        <button type="button" @click="tomarFoto">Tomar foto</button>
        <button type="button" class="secundario" @click="cerrarCamara">Cancelar</button>
      </div>
    </dialog>
    <dialog ref="dialogo" class="dialogo-recorte" :aria-label="`Recortar ${etiqueta}`" @cancel.prevent="cancelar">
      <h3>Recortar {{ etiqueta }}</h3>
      <p class="ayuda-recorte">Arrastra la imagen para acomodarla. Si no se mueve en una dirección, aumenta primero la ampliación.</p>
      <canvas ref="lienzo" :width="ancho" :height="alto" role="img" :aria-label="`Vista del recorte de ${etiqueta}`"
        @pointerdown="iniciarArrastre" @pointermove="moverArrastre" @pointerup="terminarArrastre" @pointercancel="terminarArrastre"></canvas>
      <label>Ampliación <span class="requisito-campo">Opcional</span><input v-model.number="zoom" type="range" min="1" max="3" step="0.01" /></label>
      <label>Desplazamiento horizontal <span class="requisito-campo">Opcional</span><input v-model.number="horizontal" type="range" min="-100" max="100" step="1" /></label>
      <label>Desplazamiento vertical <span class="requisito-campo">Opcional</span><input v-model.number="vertical" type="range" min="-100" max="100" step="1" /></label>
      <p v-if="error" class="mensaje-error" role="alert">{{ error }}</p>
      <div class="acciones">
        <button type="button" :disabled="cargando" @click="confirmar">{{ cargando ? 'Cargando…' : 'Confirmar recorte' }}</button>
        <button type="button" class="secundario" :disabled="cargando" @click="cancelar">Cancelar</button>
      </div>
    </dialog>
  </fieldset>
</template>
