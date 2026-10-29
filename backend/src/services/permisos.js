import Rol from '../models/Rol.js'

export const CATALOGO_PERMISOS = [
  { codigo: 'SOLICITUDES_VER', nombre: 'Consultar solicitudes' },
  { codigo: 'SOLICITUDES_GESTIONAR', nombre: 'Rechazar y convertir solicitudes' },
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
    'SERVICIOS_VER', 'HORARIOS_VER'],
  PROFESIONAL: [],
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
  if (ruta === '/api/servicios') return lectura ? 'SERVICIOS_VER' : 'SERVICIOS_GESTIONAR'
  if (ruta === '/api/horarios') return lectura ? 'HORARIOS_VER' : 'HORARIOS_GESTIONAR'
  if (['/api/contenido', '/api/publicaciones', '/api/actividades',
    '/api/mensajes-contacto'].includes(ruta)) return 'PORTAL_GESTIONAR'
  return null
}
