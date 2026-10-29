export function fechaCorta(valor) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor || '')
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : (valor || '')
}

export function precioQuetzales(centavos) {
  return `Q ${(centavos / 100).toFixed(2)}`
}

export function fechaHoraGuatemala(valor) {
  if (!valor) return ''
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(valor))
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.day}/${datos.month}/${datos.year} ${datos.hour}:${datos.minute}`
}

export function mesGuatemala() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.year}-${datos.month}`
}

export function etiquetaEstado(estado) {
  return { PENDIENTE: 'Pendiente', CONFIRMADA: 'Confirmada',
    COMPLETADA: 'Completada', CANCELADA: 'Cancelada' }[estado] || estado
}
