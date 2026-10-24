import { Router } from 'express'
import { autenticar, permitirRoles } from '../middleware/autenticacion.js'
import Horario, { DIAS, ZONA_HORARIA } from '../models/Horario.js'

const router = Router()
const formatoHora = /^([01]\d|2[0-3]):[0-5]\d$/

function validar(datos) {
  if (!datos || typeof datos !== 'object' || Array.isArray(datos) ||
      Object.keys(datos).length !== 2 || !('activo' in datos) ||
      !('intervalos' in datos) || typeof datos.activo !== 'boolean' ||
      !Array.isArray(datos.intervalos) || datos.intervalos.length > 8 ||
      (datos.activo && datos.intervalos.length === 0)) {
    return 'Configuración de horario inválida'
  }
  for (const intervalo of datos.intervalos) {
    if (!intervalo || typeof intervalo !== 'object' || Array.isArray(intervalo) ||
        Object.keys(intervalo).length !== 2 ||
        typeof intervalo.horaInicio !== 'string' || typeof intervalo.horaFin !== 'string' ||
        !formatoHora.test(intervalo.horaInicio) || !formatoHora.test(intervalo.horaFin) ||
        intervalo.horaInicio >= intervalo.horaFin) {
      return 'Intervalo inválido: usa horas HH:mm y un fin posterior al inicio'
    }
  }
  const ordenados = [...datos.intervalos].sort((a, b) =>
    a.horaInicio.localeCompare(b.horaInicio))
  if (ordenados.some((actual, indice) => indice > 0 &&
      actual.horaInicio < ordenados[indice - 1].horaFin)) {
    return 'Los intervalos de un día no pueden traslaparse'
  }
  return null
}

function respuesta(horario, { privado = false } = {}) {
  const datos = { dia: horario.dia, intervalos: horario.intervalos.map((intervalo) => ({
    horaInicio: intervalo.horaInicio, horaFin: intervalo.horaFin,
  })) }
  if (privado) {
    datos.id = horario.id
    datos.activo = horario.activo
  }
  return datos
}

function ordenar(horarios) {
  return horarios.sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia))
}

router.get('/', async (req, res) => {
  if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
  const horarios = await Horario.find({ activo: true })
  res.json({ zonaHoraria: ZONA_HORARIA,
    horarios: ordenar(horarios).map((horario) => respuesta(horario)) })
})

router.get('/administracion', autenticar,
  permitirRoles('ADMINISTRADOR', 'RECEPCIONISTA'), async (req, res) => {
    if (Object.keys(req.query).length) return res.status(400).json({ mensaje: 'Filtros inválidos' })
    const horarios = await Horario.find()
    res.json({ zonaHoraria: ZONA_HORARIA,
      horarios: ordenar(horarios).map((horario) => respuesta(horario, { privado: true })) })
  })

router.put('/:dia', autenticar, permitirRoles('ADMINISTRADOR'), async (req, res) => {
  const dia = req.params.dia.toUpperCase()
  if (!DIAS.includes(dia)) return res.status(400).json({ mensaje: 'Día inválido' })
  const error = validar(req.body)
  if (error) return res.status(400).json({ mensaje: error })
  const intervalos = [...req.body.intervalos].sort((a, b) =>
    a.horaInicio.localeCompare(b.horaInicio))
  try {
    const horario = await Horario.findOneAndUpdate({ dia },
      { $set: { activo: req.body.activo, intervalos } },
      { upsert: true, returnDocument: 'after', runValidators: true })
    res.json({ horario: respuesta(horario, { privado: true }), zonaHoraria: ZONA_HORARIA })
  } catch (fallo) {
    if (fallo.code === 11000) {
      return res.status(409).json({ mensaje: 'El horario fue modificado a la vez. Intenta de nuevo.' })
    }
    throw fallo
  }
})

export default router
