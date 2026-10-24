# SIGCA

Sistema Integral de Gestión de Citas y Atención. Proyecto individual del curso de Desarrollo Web de Ingeniería en Sistemas.

## Estado del proyecto

La Etapa 2 contiene la estructura ejecutable de Vue y Express. El backend de producción ya está activo en Render; los módulos funcionales se implementan por etapas.

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

## Primer despliegue

El backend está publicado en Render y conectado a `sigca_prod`. El frontend está publicado en Vercel. Se usa este repositorio individual y la rama `main`. Los valores de producción se introducen en los paneles de Vercel y Render; no se guardan en archivos `.env` del repositorio ni se copian los valores locales de `sigca_dev`.

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

El backend escucha en `0.0.0.0` y solo devuelve HTTP 200 en `/api/health` cuando Mongoose está conectado. `MONGO_URI` se configura únicamente en Render. La autenticación requiere `JWT_SECRET`: un valor aleatorio de al menos 32 caracteres que se guarda solo en las variables de entorno de Render. La salud de la API permanece disponible aunque aún no se haya configurado ese secreto.

La API usa `https://sigca-api-nelson.onrender.com` y el frontend `https://sigca-theta.vercel.app`. En Vercel, `VITE_API_URL` contiene la URL de la API; en Render, `CORS_ORIGIN` contiene el origen del frontend sin barra final. Se verificaron HTTP 200 en ambas URL públicas, HTTP 204 con el encabezado CORS esperado y `API: Conectada` en `/estado`. Vercel publicó el último push de `main`. Render no inició automáticamente el despliegue de pacientes y responsables; se publicó el commit `1d0867f` con **Manual Deploy → Deploy latest commit**. Confirmar siempre qué commit está activo antes de probar una función nueva.

## Autenticación — primera pieza de Avance 1

El backend contiene el modelo `Usuario` con roles `ADMINISTRADOR`, `RECEPCIONISTA` y `PROFESIONAL`. `POST /api/auth/login` recibe `correo` y `password` en JSON, y devuelve un token de 8 horas y datos públicos del usuario. Limita los intentos repetidos de acceso. `GET /api/auth/me` requiere la cabecera `Authorization: Bearer <token>`; comprueba el token y vuelve a consultar si el usuario sigue activo. Las contraseñas se guardan como hashes bcrypt y no aparecen en las respuestas. `GET /api/usuarios`, `GET /api/usuarios/:id`, `POST /api/usuarios`, `PUT /api/usuarios/:id` y el `PATCH` anterior requieren un administrador autenticado. El administrador puede crear, consultar, editar, cambiar roles y activar o desactivar usuarios sin borrar su historial. El backend impide desactivar la propia cuenta o dejar el sistema sin un administrador activo.

El cambio de contraseña está separado de la edición general: `PUT /api/auth/password` exige la contraseña actual del propio usuario. `PUT /api/usuarios/:id/password` permite al administrador restablecer otra cuenta solo tras comprobar su propia contraseña. Ambos cambios invalidan los tokens anteriores de la cuenta afectada. Cambiar el rol o estado también invalida sus tokens anteriores. La interfaz ofrece `/mi-password` a cada usuario y el restablecimiento en `/usuarios` al administrador. Nunca se envía un hash en la respuesta.

El primer administrador se crea con `npm run crear-admin` desde `backend/`. Antes de ejecutarlo se proporcionan por variables de entorno `ADMIN_NOMBRE`, `ADMIN_CORREO`, `ADMIN_PASSWORD`, `ADMIN_EXPECTED_DB` y `MONGO_URI`; `ADMIN_EXPECTED_DB` debe coincidir exactamente con `sigca_dev`, `sigca_test` o `sigca_prod` según el entorno deseado. El comando se detiene si la base conectada no coincide o si ya existe un administrador. No escribir contraseñas ni URI en comandos que queden en el historial de la terminal. El administrador inicial de `sigca_prod` fue creado por el estudiante y confirmado mediante la salida del comando; sus credenciales no se guardan en el repositorio.

La pantalla `/ingresar` y la administración `/usuarios` están publicadas en Vue. El navegador conserva el token solo durante la sesión de la pestaña; Express comprueba el permiso en cada solicitud protegida. `GET /api/auth/me` sin token responde 401, como corresponde. Se observó que una sesión del administrador abrió `/usuarios` en Vercel y mostró la lista de usuarios; no se divulgaron sus credenciales.

## Pacientes y responsables — RF-03 y RF-04

El backend incorpora modelos y rutas para registrar, consultar, buscar y modificar responsables y pacientes. `PATCH /api/pacientes/:id/estado` cambia entre `ACTIVO` e `INACTIVO` sin borrar el registro. Los roles `ADMINISTRADOR` y `RECEPCIONISTA` pueden usar estas rutas; el backend comprueba la sesión y el rol. Los profesionales todavía no reciben acceso a estos datos, porque la regla de pacientes asignados depende del módulo de citas.

| Recurso | Operaciones |
| --- | --- |
| `/api/responsables` | `GET` lista o busca, `POST` registra |
| `/api/responsables/:id` | `GET` muestra detalle y pacientes asociados, `PUT` modifica |
| `/api/pacientes` | `GET` lista o busca, `POST` registra |
| `/api/pacientes/:id` | `GET` muestra detalle, `PUT` modifica y asocia responsables |
| `/api/pacientes/:id/estado` | `PATCH` activa o desactiva |

La asociación tiene una sola fuente de verdad: `Paciente.responsables` almacena identificadores de responsables; la lista inversa se consulta desde pacientes. La edad se calcula a partir de la fecha de nacimiento y del día actual en `America/Guatemala`; no se guarda una edad fija. Las fotografías son URL o rutas, sin binarios en MongoDB. La interfaz ofrece `/pacientes` y `/responsables` después de iniciar sesión. Se puede buscar también por identificador. La lista devuelve como máximo 100 registros por búsqueda; en el formulario de pacientes se puede buscar un responsable y conservar los ya seleccionados al cambiar la búsqueda.

**Integración pendiente de fases posteriores:** al construir citas, guardar `Cita.paciente` y `Cita.profesional` como referencias. Antes de programar, consultar el paciente activo y calcular si tendrá menos de 18 años en la fecha de la cita; en ese caso exigir al menos una referencia válida en `Paciente.responsables`. Para el profesional, filtrar citas por su propio identificador y permitir consultar solo información básica de pacientes asociados a esas citas; no exponer observaciones administrativas generales. Al construir materiales, autorizar la consulta y asignación del profesional según sus pacientes asignados y comprobar que el paciente esté activo. Al construir pagos, vincular cada pago a su cita y paciente, y consultar citas y pagos del paciente mediante rutas protegidas con filtros por ese identificador. La interfaz de detalle del paciente indica que estas consultas aún no están disponibles; no devuelve datos simulados.

## Verificación local de los puntos 2 y 3

Desde `backend/`, `npm test` ejecuta pruebas HTTP con modelos simulados, sin escribir en Atlas. `npm run test:atlas` usa la URI local únicamente como base para conectarse a `sigca_test`, genera cuentas y registros ficticios, prueba la API real y elimina solo los identificadores creados por esa ejecución. El script crea un secreto temporal para las pruebas y no muestra contraseñas, tokens ni la URI. Necesita acceso a Atlas y permiso local para abrir un puerto temporal. `npm run build` desde `frontend/` comprueba la compilación de Vue. Las pruebas de producción son de solo lectura y deben realizarse después de confirmar el commit desplegado.

La versión anterior de pacientes y responsables se publicó en ambos servicios. Para comprobar la protección de rutas sin divulgar datos, abrir la URL pública de Render seguida de `/api/pacientes` o `/api/responsables` en una pestaña sin sesión debe devolver 401. Antes de atribuir cualquier resultado a esta revisión, confirmar que Render y Vercel han desplegado el commit correspondiente. Usar exclusivamente datos ficticios en las evidencias académicas.

## Servicios y horarios — fase 4

Los servicios se guardan con identificador, nombre, descripción, duración en minutos, `precioCentavos`, imagen como URL HTTP(S) o ruta, y estado `ACTIVO` o `INACTIVO`. El frontend muestra quetzales y convierte el importe a centavos enteros antes de enviarlo. La API acepta duraciones enteras de 1 a 1440 minutos y precios de Q0.01 a Q1,000,000.00. Desactivar un servicio conserva su documento.

| Ruta | Acceso | Uso |
| --- | --- | --- |
| `GET /api/servicios` y `GET /api/servicios/:id` | Público | Solo servicios activos; `buscar` filtra por nombre, descripción o identificador. Un inactivo no aparece ni en el detalle. |
| `GET /api/servicios/administracion` y `GET /api/servicios/administracion/:id` | Administrador y recepcionista | Consulta interna de activos e inactivos; admite `buscar` y `estado` en el listado. |
| `POST /api/servicios`, `PUT /api/servicios/:id`, `PATCH /api/servicios/:id/estado` | Administrador | Registro, modificación y cambio de estado. |

La pantalla pública es `/servicios`; `/gestion-servicios` permite al administrador modificar y a recepción consultar. El profesional puede consultar los servicios activos públicos, sin acceso a la administración. No hay carga de imágenes: se guarda únicamente su URL o ruta.

Los horarios se guardan en MongoDB por día de la semana, con estado abierto o cerrado e intervalos `horaInicio`–`horaFin` en **America/Guatemala**. Un día abierto necesita al menos un intervalo. Los intervalos deben usar `HH:mm`, terminar después de comenzar y no traslaparse; se admiten hasta ocho por día. No se publican horarios inventados cuando aún no están configurados.

| Ruta | Acceso | Uso |
| --- | --- | --- |
| `GET /api/horarios` | Público | Muestra únicamente días abiertos e intervalos para visitantes. |
| `GET /api/horarios/administracion` | Administrador y recepcionista | Consulta toda la configuración, incluidos días cerrados. |
| `PUT /api/horarios/:dia` | Administrador | Configura uno de `LUNES`, `MARTES`, `MIERCOLES`, `JUEVES`, `VIERNES`, `SABADO` o `DOMINGO`. |

Las pantallas son `/horarios` para visitantes y `/gestion-horarios` para administración y recepción; solo el administrador ve el formulario de cambios.

**Integración pendiente:** al construir las citas, el backend deberá comprobar que el servicio siga `ACTIVO`, copiar `precioCentavos` y `duracionMinutos` a cada cita para conservar sus valores históricos y validar `fecha`, `horaInicio` y `horaFin` contra los intervalos del día en `America/Guatemala`. Esta fase no crea citas ni reservas.

Desde `backend/`, `npm test` comprueba reglas y permisos mediante HTTP con modelos simulados. `npm run test:atlas:modulo4` está preparado para `sigca_test`: cambia únicamente el nombre de base en la URI local, crea datos ficticios, elige un día todavía libre y limpia solo los identificadores creados. Este segundo comando escribe y elimina datos de prueba; ejecútalo únicamente cuando esté permitido el acceso a Atlas. Desde `frontend/`, `npm run build` comprueba la compilación. El estudiante indicó que la fase 4 fue probada y revisada en producción.

## Portal público y administración institucional — fase 5

El portal usa contenido de MongoDB. Al iniciar sin un documento institucional, `GET /api/contenido` devuelve `contenido: null`: la interfaz muestra un estado vacío y la marca provisional SIGCA, sin atribuir a la base imágenes o textos de ejemplo. El administrador guarda nombre del centro, URL o ruta del logotipo, información principal, misión, visión, imágenes del carrusel e información de contacto desde `/administracion-portal`. El carrusel acepta **ninguna imagen o de 5 a 10 imágenes**; esta regla evita publicar un carrusel incompleto. El formulario exige nombre, información principal, misión, visión, correo, teléfono y dirección. Los datos institucionales se guardan en `contenidoInstitucional`, separados de `servicios` y `horarios`.

| Recurso | Acceso | Uso |
| --- | --- | --- |
| `GET /api/contenido` | Público | Identidad, misión, visión, carrusel y contacto; `null` antes de configurar. |
| `PUT /api/contenido` | Administrador | Crea o actualiza el único documento institucional. |
| `GET /api/publicaciones` y `GET /api/actividades` | Público | Hasta 100 registros visibles por sección; no exponen los ocultos. |
| `GET /api/publicaciones/administracion` y `GET /api/actividades/administracion` | Administrador | Lista visible y oculta. |
| `POST /api/publicaciones`, `POST /api/actividades` | Administrador | Crea contenido. |
| `PUT /api/publicaciones/:id`, `PUT /api/actividades/:id` | Administrador | Edita contenido. |
| `PATCH /api/publicaciones/:id/estado`, `PATCH /api/actividades/:id/estado` | Administrador | Publica u oculta sin eliminar. |
| `POST /api/mensajes-contacto` | Público | Valida y guarda un mensaje; devuelve solo confirmación, con máximo de 10 intentos cada 15 minutos por IP. |
| `GET /api/mensajes-contacto` | Administrador | Consulta hasta 100 mensajes recientes. |

Las publicaciones educativas incluyen título, descripción, fecha `AAAA-MM-DD` válida, imagen y enlace opcionales. Las actividades se clasifican como capacitación, escuela para padres u otra actividad; incluyen descripción y hasta 10 URL o rutas de imágenes. Los enlaces y las imágenes solo aceptan HTTP(S) o rutas que empiecen por `/`; no se suben binarios. La lista pública muestra únicamente contenido activo. Los mensajes de contacto guardan nombre, correo, teléfono, asunto, mensaje y fecha de creación. La API no devuelve datos del remitente al enviar el mensaje; la lista solo permite `ADMINISTRADOR`.

Las páginas públicas son `/`, `/servicios`, `/educacion`, `/corporativo`, `/horarios` y `/contacto`. Servicios y horarios consultan las rutas públicas existentes; el administrador sigue usando `/gestion-servicios` y `/gestion-horarios`. El botón **Solicitar cita** se muestra deshabilitado y explica que el formulario y su funcionamiento pertenecen a la fase 6. No crea solicitudes ni citas. El portal funciona en pantallas estrechas mediante menús flexibles, tarjetas y formularios de una columna.

**Pruebas locales:** desde `backend/`, `npm test` ejecuta pruebas HTTP con modelos simulados para permisos, validaciones, visibilidad y confirmación de contacto, sin tocar Atlas. Desde `frontend/`, `npm run build` compila Vue. No se preparó ni ejecutó una prueba de integración con escritura en `sigca_test` para esta fase. La persistencia real y el aspecto en dispositivos deberán comprobarse por el estudiante antes de publicar o durante la revisión controlada. Esta fase no modifica Render, Vercel ni Atlas desde los scripts de prueba.

**Publicación pendiente de autorización:** primero revisar los commits locales; después, cuando se autorice, enviar `main` al repositorio remoto y confirmar en Render y Vercel que se despliega ese commit. Probar entonces el portal público, guardar contenido real o ficticio de demostración desde el administrador, enviar un mensaje ficticio y comprobar que solo ese rol puede consultarlo. No usar datos reales de pacientes ni mostrar mensajes privados en capturas públicas.

Referencias: [build y monorepos en Vercel](https://vercel.com/docs/builds/configure-a-build), [rewrites de Vercel](https://vercel.com/docs/project-configuration/vercel-json), [variables de Vite](https://vite.dev/guide/env-and-mode), [monorepos de Render](https://render.com/docs/monorepo-support), [versión de Node en Render](https://render.com/docs/node-version), [puerto de servicios web](https://render.com/docs/web-services) y [health checks de Render](https://render.com/docs/health-checks).
