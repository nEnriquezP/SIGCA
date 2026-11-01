export function hoyGuatemala(ahora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Guatemala',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ahora)
  const datos = Object.fromEntries(partes.map(({ type, value }) => [type, value]))
  return `${datos.year}-${datos.month}-${datos.day}`
}

function diaUtc(fecha) {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const valor = new Date(Date.UTC(anio, mes - 1, dia))
  if (valor.getUTCFullYear() !== anio || valor.getUTCMonth() !== mes - 1 ||
      valor.getUTCDate() !== dia) return null
  return valor
}

export function fechaMaximaGuatemala(ahora = new Date()) {
  const limite = diaUtc(hoyGuatemala(ahora))
  limite.setUTCDate(limite.getUTCDate() + 365)
  return limite.toISOString().slice(0, 10)
}

export function diasHasta(fecha, ahora = new Date()) {
  const destino = diaUtc(fecha)
  const hoy = diaUtc(hoyGuatemala(ahora))
  if (!destino) return null
  return Math.round((destino - hoy) / 86400000)
}

export function avisoEspera(fecha, ahora = new Date()) {
  const dias = diasHasta(fecha, ahora)
  if (dias === null) return 'Selecciona una fecha válida.'
  if (dias < 0 || dias > 365) return 'Elige una fecha entre hoy y los próximos 365 días.'
  if (dias === 0) return 'La cita es hoy.'
  return dias === 1 ? 'Falta 1 día.' : `Faltan ${dias} días.`
}
