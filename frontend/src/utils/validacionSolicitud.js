export function requisitosCorreoSolicitud(valor) {
  const correo = typeof valor === 'string' ? valor.trim() : ''
  const partes = correo.split('@')
  const local = partes[0] ?? ''
  const dominio = partes.length === 2 ? partes[1] : ''
  const etiquetas = dominio.split('.')
  const nombreDominio = etiquetas.length > 1 ? etiquetas.slice(0, -1) : etiquetas
  const localValido = local.length > 0 && local.length <= 64 &&
    /^[a-z\d._%+-]+$/i.test(local) && !local.startsWith('.') &&
    !local.endsWith('.') && !local.includes('..')
  const dominioValido = nombreDominio.length > 0 && nombreDominio.every((etiqueta) =>
    etiqueta.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(etiqueta))
  return [
    { texto: 'Nombre antes de @, por ejemplo nombre', cumplido: localValido },
    { texto: 'Un solo símbolo @', cumplido: partes.length === 2 },
    { texto: 'Dominio después de @, por ejemplo dominio', cumplido: dominioValido },
    { texto: 'Punto y terminación de al menos dos letras, por ejemplo .com',
      cumplido: etiquetas.length >= 2 && /^[a-z]{2,63}$/i.test(etiquetas.at(-1)) },
    { texto: 'Sin espacios y máximo 254 caracteres',
      cumplido: correo.length > 0 && correo.length <= 254 && !/\s/.test(correo) },
  ]
}

export function correoSolicitudValido(valor) {
  return requisitosCorreoSolicitud(valor).every((requisito) => requisito.cumplido)
}

export function limpiarTelefonoSolicitud(valor) {
  return String(valor ?? '').replace(/\D/g, '').replace(/^0+/, '').slice(0, 8)
}

export function telefonoSolicitudValido(valor) {
  return typeof valor === 'string' && /^[1-9][0-9]{7}$/.test(valor)
}

export function requisitosTelefonoSolicitud(valor) {
  const telefono = typeof valor === 'string' ? valor : ''
  return [
    { texto: 'Exactamente 8 dígitos', cumplido: /^[0-9]{8}$/.test(telefono) },
    { texto: 'El primer dígito debe ser de 1 a 9', cumplido: /^[1-9]/.test(telefono) },
  ]
}
