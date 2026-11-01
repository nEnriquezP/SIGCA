import test from 'node:test'
import assert from 'node:assert/strict'
import { incorporarResponsable, limpiarMarcaSiValido,
  marcarCampoInvalido } from '../src/utils/estadoFormulario.js'

test('escribir 7 no comprueba ni anuncia invalidez; al completar el campo se limpia la marca', () => {
  const eliminados = []
  const etiqueta = { removeAttribute: (nombre) => eliminados.push(nombre) }
  const campo = {
    form: {}, validity: { valid: false }, id: '',
    closest: () => etiqueta,
    removeAttribute: (nombre) => eliminados.push(nombre),
    checkValidity: () => { throw new Error('checkValidity no debe ejecutarse al escribir') },
  }
  limpiarMarcaSiValido({ target: campo })
  assert.deepEqual(eliminados, [])

  campo.validity.valid = true
  limpiarMarcaSiValido({ target: campo })
  assert.deepEqual(eliminados, ['aria-invalid', 'data-error-campo'])
})

test('al intentar guardar un teléfono incompleto se marca y se emite un solo aviso', async () => {
  const avisos = []
  const marcas = []
  const formulario = { dataset: {}, classList: { add: (nombre) => marcas.push(nombre) } }
  const etiqueta = { textContent: 'Teléfono Obligatorio',
    setAttribute: (nombre) => marcas.push(nombre) }
  const campo = { form: formulario, id: '', dataset: {}, value: '7',
    closest: () => etiqueta, setAttribute: (nombre) => marcas.push(nombre) }
  marcarCampoInvalido({ target: campo }, (mensaje) => avisos.push(mensaje))
  marcarCampoInvalido({ target: campo }, (mensaje) => avisos.push(mensaje))
  assert.deepEqual(avisos, ['Revisa el campo Teléfono.'])
  assert.equal(campo.value, '7')
  assert.ok(marcas.includes('aria-invalid'))
  await Promise.resolve()
  assert.equal(formulario.dataset.avisoInvalido, undefined)
})

test('el responsable nuevo queda seleccionado por id sin alterar los datos del paciente', () => {
  const paciente = { nombres: 'Paciente ficticio', telefono: '71234567',
    fotografia: '/api/imagenes/privadas/foto-ficticia', responsables: ['id-anterior'] }
  const disponibles = [{ id: 'id-anterior', nombres: 'Anterior' }]
  const responsable = { id: 'id-nuevo', codigo: 'RESPO-000002', nombres: 'Nuevo' }
  const resultado = incorporarResponsable(paciente, disponibles, responsable)
  assert.deepEqual(resultado.paciente.responsables, ['id-anterior', 'id-nuevo'])
  assert.equal(resultado.paciente.telefono, paciente.telefono)
  assert.equal(resultado.paciente.fotografia, paciente.fotografia)
  assert.deepEqual(paciente.responsables, ['id-anterior'])
  assert.equal(resultado.disponibles.at(-1), responsable)
  assert.equal(incorporarResponsable(resultado.paciente, resultado.disponibles, responsable)
    .paciente.responsables.length, 2)
})
