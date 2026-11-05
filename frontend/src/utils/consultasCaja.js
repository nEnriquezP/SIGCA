export function rutaListadoCajas({ pagina = 0, estado = '', fechaOperativa = '', usuarioResponsable = '' } = {}) {
  const parametros = new URLSearchParams({ pagina: String(pagina) })
  if (estado) parametros.set('estado', estado)
  if (fechaOperativa) parametros.set('fechaOperativa', fechaOperativa)
  if (usuarioResponsable) parametros.set('usuarioResponsable', usuarioResponsable)
  return `/api/cajas?${parametros}`
}

export function rutaMovimientosCaja(id, pagina = 0) {
  return `/api/cajas/${encodeURIComponent(id)}/movimientos?pagina=${pagina}`
}
