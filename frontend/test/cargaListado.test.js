import test from 'node:test'
import assert from 'node:assert/strict'
import { crearCargaListado } from '../src/utils/cargaListado.js'

function diferida() {
  let resolver
  const promesa = new Promise((res) => { resolver = res })
  return { promesa, resolver }
}

test('mantiene la tabla durante recargas, deduplica y descarta respuestas atrasadas', async () => {
  const pendientes = []
  const listado = crearCargaListado((parametros) => {
    const espera = diferida()
    pendientes.push({ clave: parametros.toString(), ...espera })
    return espera.promesa
  })
  const primera = listado.cargar(new URLSearchParams('pagina=0'))
  assert.equal(listado.cargando.value, true)
  pendientes[0].resolver({ pacientes: [{ id: '1' }], total: 81, totalPaginas: 3, pagina: 0 })
  await primera
  assert.deepEqual(listado.pacientes.value, [{ id: '1' }])
  const antigua = listado.cargar(new URLSearchParams('pagina=1'))
  assert.equal(listado.cargando.value, false)
  assert.equal(listado.actualizando.value, true)
  assert.deepEqual(listado.pacientes.value, [{ id: '1' }])
  assert.equal(listado.cargar(new URLSearchParams('pagina=1')), antigua)
  assert.equal(pendientes.length, 2)
  const reciente = listado.cargar(new URLSearchParams('pagina=2'))
  pendientes[2].resolver({ pacientes: [{ id: '3' }], total: 81, totalPaginas: 3, pagina: 2 })
  await reciente
  pendientes[1].resolver({ pacientes: [{ id: '2' }], total: 81, totalPaginas: 3, pagina: 1 })
  await antigua
  assert.deepEqual(listado.pacientes.value, [{ id: '3' }])
  assert.equal(listado.pagina.value, 2)
  assert.equal(listado.actualizando.value, false)
})

test('una recarga forzada sustituye una solicitud previa con los mismos filtros', async () => {
  const pendientes = []
  const listado = crearCargaListado(() => {
    const espera = diferida()
    pendientes.push(espera)
    return espera.promesa
  })
  const anterior = listado.cargar(new URLSearchParams('orden=codigo_asc'))
  const nueva = listado.cargar(new URLSearchParams('orden=codigo_asc'), true)
  assert.equal(pendientes.length, 2)
  pendientes[1].resolver({ pacientes: [{ id: 'nuevo' }], total: 1, totalPaginas: 1, pagina: 0 })
  await nueva
  pendientes[0].resolver({ pacientes: [{ id: 'viejo' }], total: 1, totalPaginas: 1, pagina: 0 })
  await anterior
  assert.equal(listado.pacientes.value[0].id, 'nuevo')
})
