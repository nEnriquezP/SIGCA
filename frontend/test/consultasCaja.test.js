import test from 'node:test'
import assert from 'node:assert/strict'
import { rutaListadoCajas, rutaMovimientosCaja } from '../src/utils/consultasCaja.js'

test('el historial omite filtros vacíos y envía la página solicitada', () => {
  assert.equal(rutaListadoCajas(), '/api/cajas?pagina=0')
  assert.equal(rutaListadoCajas({ pagina: 2, estado: 'CERRADA',
    fechaOperativa: '2026-11-03' }),
  '/api/cajas?pagina=2&estado=CERRADA&fechaOperativa=2026-11-03')
  assert.equal(rutaListadoCajas({ usuarioResponsable: '507f1f77bcf86cd799439011' }),
    '/api/cajas?pagina=0&usuarioResponsable=507f1f77bcf86cd799439011')
})

test('la consulta de movimientos conserva la página y codifica el identificador', () => {
  assert.equal(rutaMovimientosCaja('507f1f77bcf86cd799439011', 3),
    '/api/cajas/507f1f77bcf86cd799439011/movimientos?pagina=3')
  assert.equal(rutaMovimientosCaja('id/con barra', 0),
    '/api/cajas/id%2Fcon%20barra/movimientos?pagina=0')
})
