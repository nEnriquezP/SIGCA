import test from 'node:test'
import assert from 'node:assert/strict'
import { entradaQuetzales, leerQuetzales, quetzales } from '../src/utils/dinero.js'
import { createPinia, setActivePinia } from 'pinia'
import { usePagosStore } from '../src/stores/pagos.js'

test('los importes se convierten sin fracciones de centavo', () => {
  assert.equal(leerQuetzales('12.34'), 1234)
  assert.equal(leerQuetzales('0,01'), 1)
  assert.equal(leerQuetzales('0'), null)
  assert.equal(leerQuetzales('0', { admiteCero: true }), 0)
  for (const valor of ['1.234', '-1', '1e3', 'abc', '', '90071992547410.92']) {
    assert.equal(leerQuetzales(valor), null)
  }
  assert.equal(entradaQuetzales(1001), '10.01')
  assert.match(quetzales(1001), /^Q /)
})

test('la misma operación conserva solicitudId y un cambio de monto crea otro intento', () => {
  const datos = new Map()
  globalThis.sessionStorage = {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, valor),
    removeItem: (clave) => datos.delete(clave),
  }
  try {
    setActivePinia(createPinia())
    const pagos = usePagosStore()
    const primero = pagos.solicitudPara('usuario-1', 'cita-1', 100, 'EFECTIVO')
    assert.equal(pagos.solicitudPara('usuario-1', 'cita-1', 100, 'EFECTIVO'), primero)
    setActivePinia(createPinia())
    const restaurados = usePagosStore()
    assert.equal(restaurados.solicitudPara('usuario-1', 'cita-1', 100, 'EFECTIVO'), primero)
    assert.notEqual(restaurados.solicitudPara('usuario-1', 'cita-1', 200, 'EFECTIVO'), primero)
    assert.ok(datos.has('sigca_pago_intento'))
    restaurados.limpiar()
    assert.equal(datos.has('sigca_pago_intento'), false)
  } finally {
    delete globalThis.sessionStorage
  }
})
