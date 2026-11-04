import test from 'node:test'
import assert from 'node:assert/strict'
import { correoSolicitudValido, limpiarTelefonoSolicitud, requisitosCorreoSolicitud,
  requisitosTelefonoSolicitud, telefonoSolicitudValido } from '../src/utils/validacionSolicitud.js'

test('el correo guía cada parte y exige dominio completo', () => {
  assert.deepEqual(requisitosCorreoSolicitud('nombre@dominio.com').map((item) => item.cumplido),
    [true, true, true, true, true])
  for (const correo of ['nombre', 'nombre@', 'nombre@dominio', 'nombre@dominio.',
    'nombre@@dominio.com', '.nombre@dominio.com', 'nombre..dos@dominio.com',
    'nombre@-dominio.com', 'nombre@dominio.c', 'nombre apellido@dominio.com']) {
    assert.equal(correoSolicitudValido(correo), false, correo)
  }
  assert.equal(correoSolicitudValido('nombre+uno@sub.dominio.com'), true)
})

test('el teléfono solo admite ocho dígitos y descarta el cero inicial', () => {
  assert.equal(limpiarTelefonoSolicitud('0a79-223344999'), '79223344')
  assert.equal(limpiarTelefonoSolicitud('000'), '')
  assert.equal(telefonoSolicitudValido('79223344'), true)
  assert.deepEqual(requisitosTelefonoSolicitud('79223344').map((item) => item.cumplido),
    [true, true])
  for (const telefono of ['09223344', '7922334', '792233449', '+50279223344',
    '7922-3344', '7922abcd']) assert.equal(telefonoSolicitudValido(telefono), false)
})
