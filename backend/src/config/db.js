import mongoose from 'mongoose'

export async function conectarBaseDeDatos() {
  const uri = process.env.MONGO_URI

  if (!uri) {
    throw new Error('Falta MONGO_URI en backend/.env')
  }

  await mongoose.connect(uri)
  console.log(`MongoDB conectado a la base ${mongoose.connection.name}`)
}
