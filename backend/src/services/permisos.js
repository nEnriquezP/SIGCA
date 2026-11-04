import Rol from '../models/Rol.js'

export const CATALOGO_PERMISOS = [
  { codigo: 'SOLICITUDES_VER', nombre: 'Consultar solicitudes' },
  { codigo: 'SOLICITUDES_GESTIONAR', nombre: 'Rechazar y convertir solicitudes' },
  { codigo: 'CITAS_VER', nombre: 'Consultar citas y calendario', asignable: false },
  { codigo: 'CITAS_GESTIONAR', nombre: 'Programar y modificar citas', asignable: false },
  { codigo: 'MATERIALES_VER', nombre: 'Consultar materiales educativos', asignable: false },
  { codigo: 'MATERIALES_GESTIONAR', nombre: 'Registrar y modificar materiales educativos', asignable: false },
  { codigo: 'MATERIALES_ASIGNAR', nombre: 'Asignar materiales educativos a pacientes', asignable: false },
  { codigo: 'CAJA_VER_PROPIA', nombre: 'Consultar la caja propia abierta', asignable: false },
  { codigo: 'CAJA_ABRIR', nombre: 'Abrir la caja propia', asignable: false },
  { codigo: 'CAJA_CERRAR_PROPIA', nombre: 'Cerrar la caja propia', asignable: false },
  { codigo: 'PAGOS_VER', nombre: 'Consultar pagos', asignable: false },
  { codigo: 'PAGOS_REGISTRAR', nombre: 'Registrar pagos', asignable: false },
  { codigo: 'PAGOS_ANULAR', nombre: 'Anular pagos', asignable: false },
  { codigo: 'PACIENTES_VER', nombre: 'Consultar pacientes y sus fotografías' },
  { codigo: 'PACIENTES_GESTIONAR', nombre: 'Registrar y modificar pacientes' },
  { codigo: 'RESPONSABLES_VER', nombre: 'Consultar responsables y sus fotografías' },
  { codigo: 'RESPONSABLES_GESTIONAR', nombre: 'Registrar y modificar responsables' },
  { codigo: 'SERVICIOS_VER', nombre: 'Consultar servicios internos' },
  { codigo: 'SERVICIOS_GESTIONAR', nombre: 'Registrar y modificar servicios' },
  { codigo: 'HORARIOS_VER', nombre: 'Consultar horarios internos' },
  { codigo: 'HORARIOS_GESTIONAR', nombre: 'Configurar horarios' },
  { codigo: 'PORTAL_GESTIONAR', nombre: 'Administrar contenido del portal y mensajes' },
  { codigo: 'USUARIOS_GESTIONAR', nombre: 'Administrar usuarios (reservado al Administrador)', asignable: false },
  { codigo: 'ROLES_GESTIONAR', nombre: 'Configurar roles (reservado al Administrador)', asignable: false },
]

const asignables = new Set(CATALOGO_PERMISOS.filter((permiso) => permiso.asignable !== false)
  .map((permiso) => permiso.codigo))
export const DEPENDENCIAS_PERMISOS = {
  SOLICITUDES_GESTIONAR: ['SOLICITUDES_VER', 'PACIENTES_VER'],
  PACIENTES_GESTIONAR: ['PACIENTES_VER', 'RESPONSABLES_VER'],
  RESPONSABLES_GESTIONAR: ['RESPONSABLES_VER'],
  SERVICIOS_GESTIONAR: ['SERVICIOS_VER'],
  HORARIOS_GESTIONAR: ['HORARIOS_VER'],
}
export const PERMISOS_PREDEFINIDOS = {
  ADMINISTRADOR: CATALOGO_PERMISOS.map((permiso) => permiso.codigo),
  RECEPCIONISTA: ['SOLICITUDES_VER', 'SOLICITUDES_GESTIONAR', 'PACIENTES_VER',
    'PACIENTES_GESTIONAR', 'RESPONSABLES_VER', 'RESPONSABLES_GESTIONAR',
    'SERVICIOS_VER', 'HORARIOS_VER', 'CITAS_VER', 'CITAS_GESTIONAR',
    'CAJA_VER_PROPIA', 'CAJA_ABRIR', 'CAJA_CERRAR_PROPIA',
    'PAGOS_VER', 'PAGOS_REGISTRAR'],
  PROFESIONAL: ['CITAS_VER', 'MATERIALES_VER', 'MATERIALES_ASIGNAR'],
}

export function permisosValidos(permisos) {
  return Array.isArray(permisos) && permisos.length <= asignables.size &&
    new Set(permisos).size === permisos.length && permisos.every((permiso) => asignables.has(permiso)) &&
    Object.entries(DEPENDENCIAS_PERMISOS).every(([permiso, dependencias]) =>
      !permisos.includes(permiso) || dependencias.every((dependencia) => permisos.includes(dependencia)))
}

export async function permisosDeUsuario(usuario) {
  if (Object.hasOwn(PERMISOS_PREDEFINIDOS, usuario.rol)) {
    return PERMISOS_PREDEFINIDOS[usuario.rol]
  }
  if (typeof usuario.rol !== 'string' || !usuario.rol.startsWith('ROL_')) return []
  const rol = await Rol.findOne({ codigo: usuario.rol }).lean()
  return rol?.permisos?.filter((permiso) => asignables.has(permiso)) ?? []
}

export function permisoParaRuta(req) {
  const ruta = req.baseUrl
  const metodo = req.method
  const lectura = metodo === 'GET'
  if (ruta === '/api/usuarios') return 'USUARIOS_GESTIONAR'
  if (ruta === '/api/roles') return 'ROLES_GESTIONAR'
  if (ruta === '/api/pacientes') return lectura ? 'PACIENTES_VER' : 'PACIENTES_GESTIONAR'
  if (ruta === '/api/responsables') return lectura ? 'RESPONSABLES_VER' : 'RESPONSABLES_GESTIONAR'
  if (ruta === '/api/solicitudes-cita') return lectura ? 'SOLICITUDES_VER' : 'SOLICITUDES_GESTIONAR'
  if (ruta === '/api/citas') return lectura ? 'CITAS_VER' : 'CITAS_GESTIONAR'
  if (ruta === '/api/materiales') return lectura ? 'MATERIALES_VER' : 'MATERIALES_GESTIONAR'
  if (ruta === '/api/asignaciones-materiales') return lectura ? 'MATERIALES_VER' : 'MATERIALES_ASIGNAR'
  if (ruta === '/api/cajas') return lectura ? 'CAJA_VER_PROPIA' :
    req.path.endsWith('/cerrar') ? 'CAJA_CERRAR_PROPIA' : 'CAJA_ABRIR'
  if (ruta === '/api/pagos') return lectura ? 'PAGOS_VER' :
    req.path.endsWith('/anular') ? 'PAGOS_ANULAR' : 'PAGOS_REGISTRAR'
  if (ruta === '/api/servicios') return lectura ? 'SERVICIOS_VER' : 'SERVICIOS_GESTIONAR'
  if (ruta === '/api/horarios') return lectura ? 'HORARIOS_VER' : 'HORARIOS_GESTIONAR'
  if (['/api/contenido', '/api/publicaciones', '/api/actividades',
    '/api/mensajes-contacto'].includes(ruta)) return 'PORTAL_GESTIONAR'
  return null
}
