# SIGCA

Sistema Integral de Gestión de Citas y Atención. Proyecto individual del curso de Desarrollo Web de Ingeniería en Sistemas.

## Estado del proyecto

La Etapa 2 contiene la estructura ejecutable de Vue y Express. Los módulos funcionales se implementarán por etapas.

## Tecnologías

- Frontend: Vue 3, Vite, Vue Router, Pinia y JavaScript.
- Backend: Node.js, Express, Mongoose y JavaScript.
- Base de datos: MongoDB Atlas, accesible únicamente desde el backend.

## Preparación local

1. Instalar dependencias con `npm install` dentro de `frontend/` y de `backend/`.
2. Copiar `backend/.env.example` a `backend/.env`.
3. Definir `MONGO_URI` en `backend/.env` con una URI de Atlas que incluya la base `sigca_dev`.
4. Ejecutar `npm run dev` en una terminal dentro de `backend/`.
5. Ejecutar `npm run dev` en otra terminal dentro de `frontend/`.

El frontend se abrirá en `http://localhost:5173`. La API usará `http://localhost:3000` y responderá en `/api/health` cuando la conexión con Atlas esté disponible.

Para usar otra base de datos, se cambia el nombre en `MONGO_URI` del archivo de entorno correspondiente; no se modifica el código fuente. Nunca se debe compartir ni versionar `backend/.env`.
