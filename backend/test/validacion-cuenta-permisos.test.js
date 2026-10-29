import test from 'node:test'
import assert from 'node:assert/strict'
import { nombreCuentaValido, correoCuentaValido, passwordNuevaValida } from '../src/services/validacionCuenta.js'
import { permisosValidos, permisoParaRuta, PERMISOS_PREDEFINIDOS } from '../src/services/permisos.js'
import { permitirRoles } from '../src/middleware/autenticacion.js'

test('nombre, correo y contraseña nuevos cumplen la política sin bloquear correos universitarios', () => {
  assert.equal(nombreCuentaValido('María José Ñúñez'), true)
  for (const nombre of ['Juan2', 'Juan@', '']) assert.equal(nombreCuentaValido(nombre), false)
  assert.equal(correoCuentaValido('alumna@miumg.edu.gt'), true)
  for (const correo of ['a@dominio', 'a@@dominio.com', 'a@.com', 'a@dominio.c']) {
    assert.equal(correoCuentaValido(correo), false)
  }
  assert.equal(passwordNuevaValida('Segura#8a'), true)
  for (const password of ['Corta#1', 'sinmayuscula#1', 'SINMINUSCULA#1',
    'SinNumero#', 'SinSimbolo1', 'Demasiada!Clave1']) {
    assert.equal(passwordNuevaValida(password), false)
  }
  assert.equal(passwordNuevaValida(`Segura#8${'a'.repeat(23)}`), false)
})

test('permisos personalizados no permiten escalar a usuarios/roles ni gestionar sin leer', () => {
  assert.equal(PERMISOS_PREDEFINIDOS.ADMINISTRADOR.includes('ROLES_GESTIONAR'), true)
  assert.equal(permisosValidos(['PACIENTES_VER', 'RESPONSABLES_VER', 'PACIENTES_GESTIONAR']), true)
  assert.equal(permisosValidos(['PACIENTES_GESTIONAR']), false)
  assert.equal(permisosValidos(['USUARIOS_GESTIONAR']), false)
  assert.equal(permisosValidos(['PACIENTES_VER', 'PACIENTES_VER']), false)
  assert.equal(permisoParaRuta({ baseUrl: '/api/servicios', method: 'POST' }), 'SERVICIOS_GESTIONAR')
})

test('middleware exige permiso de la operación concreta a los roles personalizados', () => {
  const comprobar = (baseUrl, method, permisos) => new Promise((resolver) => {
    const req = { baseUrl, method, usuario: { rol: 'ROL_PRUEBA' }, permisos: new Set(permisos) }
    const res = { status(codigo) { this.codigo = codigo; return this },
      json() { resolver(this.codigo) } }
    permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA')(req, res, () => resolver(200))
  })
  return Promise.all([
    comprobar('/api/servicios', 'GET', ['SERVICIOS_VER']).then((codigo) => assert.equal(codigo, 200)),
    comprobar('/api/servicios', 'POST', ['SERVICIOS_VER']).then((codigo) => assert.equal(codigo, 403)),
    comprobar('/api/usuarios', 'GET', ['SERVICIOS_GESTIONAR']).then((codigo) => assert.equal(codigo, 403)),
  ])
})
