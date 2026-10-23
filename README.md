# SIGCA

Sistema Integral de Gestión de Citas y Atención. Proyecto individual del curso de Desarrollo Web de Ingeniería en Sistemas.

## Estado del proyecto

La Etapa 2 contiene la estructura ejecutable de Vue y Express. Los módulos funcionales se implementarán por etapas.

## Tecnologías

- Frontend: Vue 3, Vite, Vue Router, Pinia y JavaScript.
- Backend: Node.js, Express, Mongoose y JavaScript.
- Base de datos: MongoDB Atlas, accesible únicamente desde el backend.

## Preparación local

Usar Node.js 24.17.0. En la Terminal integrada de VS Code, situada en la raíz del repositorio, ejecutar `nvm use`: NVM leerá `.nvmrc` y seleccionará esa versión. El mismo comando también funciona desde `backend/` y `frontend/`. Repetirlo en cada terminal nueva antes de usar `npm`. Comprobar con `node -v`, `npm -v` y `which node`; Node debe indicar `v24.17.0` y su ruta debe estar dentro de `~/.nvm/versions/node/v24.17.0/`.

1. Instalar dependencias con `npm ci` dentro de `frontend/` y de `backend/`.
2. Copiar `backend/.env.example` a `backend/.env` y `frontend/.env.example` a `frontend/.env`.
3. Definir `MONGO_URI` en `backend/.env` con una URI de Atlas que incluya la base `sigca_dev`. Mantener `CORS_ORIGIN=http://localhost:5173`.
4. Mantener `VITE_API_URL=http://localhost:3000` en `frontend/.env`.
5. Ejecutar `npm start` en una terminal dentro de `backend/`.
6. Ejecutar `npm run dev` en otra terminal dentro de `frontend/`.

El frontend se abrirá en `http://localhost:5173`. La API usará `http://localhost:3000`. La ruta `http://localhost:5173/estado` comprueba la comunicación entre el navegador, la API y Atlas. `GET /api/health` responde 200 cuando MongoDB está conectado y 503 cuando no está disponible.

En esta Mac, `npm run dev` del backend (que usa `node --watch`) produjo `EMFILE`, por exceso de archivos abiertos. `npm start` ejecuta `node src/server.js` sin watch y sí permitió iniciar el backend. Si cambias código del backend con ese comando, detén el proceso con `Ctrl+C` y vuelve a ejecutarlo para aplicar los cambios.

Para usar otra base de datos, se cambia el nombre en `MONGO_URI` del archivo de entorno correspondiente; no se modifica el código fuente. Nunca se debe compartir ni versionar `backend/.env`.

## Primer despliegue — configuración preparada, sin publicar

**Producción aún no configurada.** Estos son los ajustes para cuando se autorice crear los servicios. Se usará este repositorio individual y la rama `main`. Los valores de producción se introducirán en los paneles de Vercel y Render; no se guardarán en archivos `.env` del repositorio ni se copiarán los valores locales de `sigca_dev`.

### Frontend en Vercel

| Ajuste | Valor previsto |
| --- | --- |
| Root Directory | `frontend` |
| Framework Preset | Vite |
| Node.js | 24.x, declarado en `frontend/package.json` |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Variable de entorno de Production | `VITE_API_URL` = URL HTTPS pública real de Render, sin `/api/health` |

`frontend/vercel.json` ya reescribe las rutas de Vue Router hacia `index.html`, incluida `/estado` al abrirla directamente o recargarla. `VITE_API_URL` se incorpora al JavaScript durante la compilación y queda visible en el navegador: solo debe contener la URL pública de la API, nunca credenciales. Si cambia, hará falta una nueva compilación de Vercel.

### Backend en Render

| Ajuste | Valor previsto |
| --- | --- |
| Tipo y runtime | Web Service, Node.js |
| Root Directory | `backend` |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| `NODE_VERSION` | `24.17.0`, para igualar la versión local verificada |
| `MONGO_URI` | URI privada de Atlas que selecciona `sigca_prod` |
| `CORS_ORIGIN` | Origen HTTPS real de Vercel, sin ruta ni barra final |
| `PORT` | Usar el valor que Render proporciona al servicio; el backend lo lee del entorno |

El backend escucha en `0.0.0.0` y solo devuelve HTTP 200 en `/api/health` cuando Mongoose está conectado. `MONGO_URI` se configura únicamente en Render. `JWT_SECRET` se añadirá cuando exista autenticación; esta etapa todavía no lo usa. Antes de publicar, habrá que comprobar con autorización que Atlas permita la conexión desde Render, sin abrir el acceso de red indiscriminadamente.

Las dos URLs reales se conocerán al crear los servicios: Render aporta la URL para `VITE_API_URL` y Vercel aporta el origen para `CORS_ORIGIN`. Puede ser necesario completar `CORS_ORIGIN` y volver a desplegar Render después del primer despliegue de Vercel. Una vez autorizado y publicado, verificar la URL real de Render con `/api/health` y abrir directamente `/estado` en la URL real de Vercel; se espera HTTP 200 y `API: Conectada`. Conectar el repositorio a estos servicios puede activar despliegues automáticos en futuros pushes a `main`, por lo que esa opción debe revisarse antes de publicar.

Referencias: [build y monorepos en Vercel](https://vercel.com/docs/builds/configure-a-build), [rewrites de Vercel](https://vercel.com/docs/project-configuration/vercel-json), [variables de Vite](https://vite.dev/guide/env-and-mode), [monorepos de Render](https://render.com/docs/monorepo-support), [versión de Node en Render](https://render.com/docs/node-version), [puerto de servicios web](https://render.com/docs/web-services) y [health checks de Render](https://render.com/docs/health-checks).
