const formato = new Intl.NumberFormat('es-GT', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})

export function quetzales(centavos) {
  return Number.isSafeInteger(centavos) ? `Q ${formato.format(centavos / 100)}` : 'Q —'
}

export function leerQuetzales(valor, { admiteCero = false } = {}) {
  const texto = String(valor ?? '').trim().replace(',', '.')
  if (!/^(0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(texto)) return null
  const [enteros, decimales = ''] = texto.split('.')
  const centavos = Number(enteros) * 100 + Number(decimales.padEnd(2, '0'))
  return Number.isSafeInteger(centavos) && (admiteCero ? centavos >= 0 : centavos > 0) ?
    centavos : null
}

export function entradaQuetzales(centavos) {
  return Number.isSafeInteger(centavos) ? (centavos / 100).toFixed(2) : ''
}
