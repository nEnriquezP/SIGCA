export function rutaListadoCajas({ pagina = 0, estado = '', fechaOperativa = '' } = {}) {
  const parametros = new URLSearchParams({ pagina: String(pagina) })
  if (estado) parametros.set('estado', estado)
  if (fechaOperativa) parametros.set('fechaOperativa', fechaOperativa)
  return `/api/cajas?${parametros}`
}

export function rutaMovimientosCaja(id, pagina = 0) {
  return `/api/cajas/${encodeURIComponent(id)}/movimientos?pagina=${pagina}`
}
