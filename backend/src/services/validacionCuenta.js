export const REGLA_PASSWORD = 'Usa de 8 a 30 caracteres: al menos una mayúscula, una minúscula, un número y uno de estos símbolos: @ # $ _.'

export function nombreCuentaValido(valor) {
  return typeof valor === 'string' && valor.trim().length <= 120 &&
    /^\p{L}+(?: +\p{L}+)*$/u.test(valor.trim())
}

export function correoCuentaValido(valor) {
  if (typeof valor !== 'string' || valor.length > 254) return false
  const correo = valor.trim()
  const partes = correo.split('@')
  if (partes.length !== 2 || partes[0].length > 64 || !/^[a-z\d._%+-]+$/i.test(partes[0]) ||
      partes[0].startsWith('.') || partes[0].endsWith('.') || partes[0].includes('..')) return false
  const etiquetas = partes[1].split('.')
  return etiquetas.length >= 2 && etiquetas.every((etiqueta) =>
    etiqueta.length <= 63 && /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(etiqueta)) &&
    /^[a-z]{2,63}$/i.test(etiquetas.at(-1))
}

export function passwordNuevaValida(valor) {
  return typeof valor === 'string' && /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@#$_])[A-Za-z\d@#$_]{8,30}$/.test(valor)
}
