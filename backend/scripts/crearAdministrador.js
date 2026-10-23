import 'dotenv/config'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import Usuario from '../src/models/Usuario.js'

const nombre = process.env.ADMIN_NOMBRE?.trim()
const correo = process.env.ADMIN_CORREO?.trim().toLowerCase()
const password = process.env.ADMIN_PASSWORD
const expectedDb = process.env.ADMIN_EXPECTED_DB

if (!process.env.MONGO_URI || !nombre || !correo || !password ||
    !/^\S+@\S+\.\S+$/.test(correo) || password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    !['sigca_dev', 'sigca_test', 'sigca_prod'].includes(expectedDb)) {
  console.error('Faltan datos del administrador o ADMIN_EXPECTED_DB; la contraseña debe tener 12 a 72 bytes')
  process.exitCode = 1
} else {
  try {
    await mongoose.connect(process.env.MONGO_URI)

    if (mongoose.connection.name !== expectedDb) {
      console.error('La base conectada no coincide con ADMIN_EXPECTED_DB; no se creó ningún usuario')
      process.exitCode = 1
    } else if (await Usuario.exists({ rol: 'ADMINISTRADOR' })) {
      console.log('Ya existe un administrador; no se creó otro usuario')
    } else {
      await Usuario.create({
        nombre,
        correo,
        passwordHash: await bcrypt.hash(password, 12),
        rol: 'ADMINISTRADOR',
      })
      console.log('Administrador inicial creado')
    }
  } catch {
    console.error('No se pudo crear el administrador inicial. Revisa la conexión y los datos proporcionados.')
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}
