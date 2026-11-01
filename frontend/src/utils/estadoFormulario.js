export function marcarCampoInvalido(evento, mostrarError, documento = globalThis.document) {
  const campo = evento.target
  const formulario = campo.form
  if (!formulario) return
  formulario.classList.add('formulario-validado')
  campo.setAttribute('aria-invalid', 'true')
  const etiqueta = campo.closest('label') ||
    (campo.id ? documento.querySelector(`label[for="${campo.id}"]`) : null)
  etiqueta?.setAttribute('data-error-campo', 'Revisa este campo')
  if (formulario.dataset.avisoInvalido) return
  formulario.dataset.avisoInvalido = '1'
  queueMicrotask(() => { delete formulario.dataset.avisoInvalido })
  const nombre = etiqueta?.textContent?.replace(/Obligatorio/g, '').trim().split('\n')[0] || 'obligatorio'
  mostrarError(`Revisa el campo ${nombre}.`, campo.dataset.campo || '')
}

export function limpiarMarcaSiValido(evento, documento = globalThis.document) {
  const campo = evento.target
  // validity.valid es una lectura; checkValidity() emite "invalid" mientras se escribe.
  if (!campo.form || campo.validity?.valid !== true) return
  campo.removeAttribute('aria-invalid')
  const etiqueta = campo.closest('label') ||
    (campo.id ? documento.querySelector(`label[for="${campo.id}"]`) : null)
  etiqueta?.removeAttribute('data-error-campo')
}

export function incorporarResponsable(datosPaciente, disponibles, responsable) {
  return {
    paciente: { ...datosPaciente, responsables: [...new Set([
      ...datosPaciente.responsables, responsable.id,
    ])] },
    disponibles: [...new Map([...disponibles, responsable]
      .map((item) => [item.id, item])).values()],
  }
}
