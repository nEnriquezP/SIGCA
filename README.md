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

El backend contiene el modelo `Usuario` con roles `ADMINISTRADOR`, `RECEPCIONISTA` y `PROFESIONAL`. `POST /api/auth/login` recibe `correo` y `password` en JSON, y devuelve un token de 8 horas, los datos públicos del usuario y sus permisos. Limita los intentos repetidos de acceso. `GET /api/auth/me` requiere la cabecera `Authorization: Bearer <token>`; comprueba el token y vuelve a consultar si el usuario sigue activo. Las contraseñas se guardan como hashes bcrypt y no aparecen en las respuestas. `GET /api/usuarios`, `GET /api/usuarios/:id`, `POST /api/usuarios`, `PUT /api/usuarios/:id` y el `PATCH` anterior requieren un administrador autenticado. El administrador puede crear, consultar, editar, cambiar roles y activar o desactivar usuarios sin borrar su historial. El backend impide desactivar la propia cuenta o dejar el sistema sin un administrador activo.

El panel de Usuarios muestra los permisos de los tres roles originales, que permanecen fijos. El administrador puede crear y editar roles adicionales en `/api/roles` y asignar permisos de consulta o gestión por módulo; la administración de usuarios y roles queda reservada al Administrador. La API comprueba los permisos en cada solicitud. Para cuentas nuevas y cambios de contraseña se exigen de 8 a 30 caracteres con mayúscula, minúscula, número y uno de `@`, `#`, `$` o `_`. Los nombres de usuario solo admiten letras y espacios, y los correos se validan como dirección `usuario@dominio.tld`. Las cuentas existentes pueden seguir iniciando sesión con su contraseña anterior; la nueva regla se aplica al cambiarla.

El cambio de contraseña está separado de la edición general: `PUT /api/auth/password` exige la contraseña actual del propio usuario. `PUT /api/usuarios/:id/password` permite al administrador restablecer otra cuenta solo tras comprobar su propia contraseña. Ambos cambios invalidan los tokens anteriores de la cuenta afectada. Cambiar el rol o estado también invalida sus tokens anteriores. La interfaz ofrece `/mi-password` a cada usuario y el restablecimiento en `/usuarios` al administrador. Nunca se envía un hash en la respuesta.

Cada cuenta puede elegir una fotografía propia o uno de seis avatares en `/mi-cuenta`. La foto se elige del dispositivo o de la cámara, se recorta antes de subirla y se guarda como recurso privado de Cloudinary asociado a la cuenta; MongoDB solo conserva la ruta. `PUT /api/auth/perfil` permite modificar únicamente la imagen de la propia cuenta. La API entrega la fotografía privada solo al propietario o al Administrador autenticado; cuando no hay imagen se muestra una silueta gris. La lista `/usuarios` incluye el avatar o foto, y los formularios advierten sobre cambios sin guardar al navegar o recargar la página.

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

Los formularios de registro y modificación de pacientes y responsables señalan cada dato como **Obligatorio** u **Opcional**. En pacientes, las observaciones administrativas y la asociación de responsables son opcionales; los demás datos del formulario son obligatorios. En responsables, todos los datos del registro son obligatorios. La lista sugerida de parentescos incluye `Hermano/a`; también admite escribir otro parentesco.

Cada paciente tiene un `codigo` visible e inmutable (`PAC-000001`, `PAC-000002`, etc.). El backend lo obtiene de un contador persistente mediante un incremento atómico; MongoDB impone un índice único. El `id` de la API sigue siendo el ObjectId usado por responsables, solicitudes y citas. La búsqueda de pacientes y las opciones para convertir una solicitud aceptan también el código. El formulario no lo solicita ni lo envía. Las fotografías existentes siguen siendo URL o rutas.

**Asignación de códigos a registros anteriores:** desde `backend/`, `npm run codigos:pacientes -- --db=sigca_dev` o `npm run codigos:pacientes -- --db=sigca_test` escribe únicamente en la base conectada si su nombre coincide exactamente con el argumento. El script ordena los pacientes sin código por `createdAt` y `_id`, conserva los códigos existentes, continúa desde el mayor y puede repetirse sin modificar los ya asignados. Usa transacciones por paciente y muestra solo cantidades y el último número. Antes de ejecutarlo, confirmar que la URI privada del entorno apunta a la base deseada y contar con un respaldo; nunca pegarla en el comando ni en evidencias. Mientras queden pacientes sin código, la API responde 503 a nuevos registros de pacientes para conservar el orden histórico. El script exige `--confirmar-produccion` además de `--db=sigca_prod` en una futura ejecución autorizada; esta etapa no lo ejecuta en producción.

Cada responsable recibe un código visible e inmutable `RESPO-000001`, `RESPO-000002`, etc. Se asigna desde otro contador persistente con incremento atómico e índice único; el formulario no permite proporcionarlo ni cambiarlo. Se muestra en la lista, el detalle y la asociación con pacientes, y puede buscarse por código. Las relaciones entre pacientes y responsables continúan usando ObjectId. Para responsables anteriores, `npm run codigos:responsables -- --db=sigca_dev` o `--db=sigca_test` desde `backend/` asigna códigos en orden de `createdAt` y `_id`, confirma el nombre de la base, preserva los códigos ya asignados y puede repetirse. Mientras existan responsables sin código, la API responde 503 a nuevos registros de responsables. Antes de ejecutar el script, hacer un respaldo y confirmar la base conectada. Producción exige además `--confirmar-produccion`; no ejecutar allí sin coordinar primero el despliegue y el respaldo. Las fotos y asociaciones existentes no se modifican.

Para una publicación futura: detener nuevas escrituras desde instancias antiguas, publicar primero el backend con el índice único y el bloqueo temporal de registros, ejecutar la asignación en `sigca_prod` solo después de la aprobación correspondiente, comprobar que no queden pacientes sin código y que el contador siga al último, y publicar después el frontend. No se sustituyen ObjectId ni se recrean documentos.

## Imágenes — etapa 3

Los formularios de pacientes, responsables, servicios y administración del portal permiten elegir una imagen del equipo o, cuando el navegador lo ofrece, usar la cámara. Antes de cargarla se puede ampliar y desplazar el recorte horizontal y verticalmente; también se puede cancelar. El componente muestra vista previa y las acciones Recortar, Reemplazar y Quitar. Las fotos de pacientes y responsables siguen siendo obligatorias; el carrusel conserva la regla de cero o entre cinco y diez imágenes. Los valores ya guardados como URL o ruta se siguen mostrando y no se migran. Una imagen heredada de otro dominio puede verse pero no recortarse si ese servidor no permite acceso CORS al navegador; se puede reemplazar el archivo.

La carga viaja del navegador a Express y luego a Cloudinary. Express acepta JPEG, PNG y WebP reales hasta 5 MB, dimensiones máximas de 8000 × 8000 y 24 millones de píxeles; normaliza la orientación, limita la salida a 1600 × 1600, la convierte a JPEG y elimina metadatos de cámara al volver a codificar. El nombre en Cloudinary usa un UUID, nunca el nombre original del archivo ni datos personales. MongoDB conserva solo la URL pública o una ruta interna y los metadatos mínimos para localizar la carga. No hay preset `unsigned` ni secretos en Vue.

En `backend/.env` se configuran exclusivamente `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` y `CLOUDINARY_FOLDER_PREFIX`, además de las variables ya existentes. El prefijo debe coincidir con la base conectada: `sigca/dev` para `sigca_dev`, `sigca/test` para `sigca_test` y `sigca/prod` para `sigca_prod`. Es una organización de archivos, no una frontera de seguridad. Sin configuración válida, la carga responde 503. Nunca se copian estas credenciales a `VITE_*`, código, capturas ni informes.

Los recursos públicos (servicio, logotipo, carrusel, publicación y actividad) se cargan con tipo `upload` y se guardan como URL HTTPS pública. Las nuevas fotos de paciente y responsable se cargan con tipo `authenticated`: la API devuelve solo `/api/imagenes/privadas/:id`, nunca una URL firmada. `GET` a esa ruta exige sesión de administrador o recepcionista, comprueba que la foto esté asociada a un registro y entrega los bytes desde Express sin caché; Vue los obtiene con `fetch` autenticado y libera su URL temporal al dejar de usarla. La [documentación de Cloudinary sobre acceso autenticado](https://cloudinary.com/documentation/control_access_to_media) indica que la dirección de entrega sin firma no permite acceder al original ni a las transformaciones. Las URL heredadas externas se conservan; su privacidad depende de su origen anterior y requiere revisión individual si contienen datos sensibles.

Reemplazar o quitar una imagen en un formulario solo cambia el valor que se guardará; no borra el recurso anterior de Cloudinary. Las cargas aún no asociadas quedan registradas y **no se eliminan automáticamente**, para evitar borrar un archivo usado por otro registro o por un formulario abierto sin guardar. Su limpieza queda para una revisión manual posterior de referencias y antigüedad, con aprobación antes de borrar. Esto puede consumir almacenamiento mientras no se haga esa revisión.

**Integración pendiente de fases posteriores:** al construir citas, guardar `Cita.paciente` y `Cita.profesional` como referencias. Antes de programar, consultar el paciente activo y calcular si tendrá menos de 18 años en la fecha de la cita; en ese caso exigir al menos una referencia válida en `Paciente.responsables`. Para el profesional, filtrar citas por su propio identificador y permitir consultar solo información básica de pacientes asociados a esas citas; no exponer observaciones administrativas generales. Al construir materiales, autorizar la consulta y asignación del profesional según sus pacientes asignados y comprobar que el paciente esté activo. Al construir pagos, vincular cada pago a su cita y paciente, y consultar citas y pagos del paciente mediante rutas protegidas con filtros por ese identificador. La interfaz de detalle del paciente indica que estas consultas aún no están disponibles; no devuelve datos simulados.

## Verificación local de los puntos 2 y 3

Desde `backend/`, `npm test` ejecuta pruebas HTTP con modelos simulados, sin escribir en Atlas. `npm run test:codigos:local` inicia una instancia temporal de MongoDB local con réplica de un nodo, prueba el contador, la concurrencia, la asignación repetida, las búsquedas y las referencias ObjectId, y elimina su carpeta temporal al terminar; requiere `mongod` instalado y no se conecta a Atlas. `npm run test:atlas` usa la URI local únicamente como base para conectarse a `sigca_test`, genera cuentas y registros ficticios, prueba la API real y elimina solo los identificadores creados por esa ejecución. El script crea un secreto temporal para las pruebas y no muestra contraseñas, tokens ni la URI. Necesita acceso a Atlas y permiso local para abrir un puerto temporal. `npm run build` desde `frontend/` comprueba la compilación de Vue. Las pruebas de producción son de solo lectura y deben realizarse después de confirmar el commit desplegado.

La versión anterior de pacientes y responsables se publicó en ambos servicios. Para comprobar la protección de rutas sin divulgar datos, abrir la URL pública de Render seguida de `/api/pacientes` o `/api/responsables` en una pestaña sin sesión debe devolver 401. Antes de atribuir cualquier resultado a esta revisión, confirmar que Render y Vercel han desplegado el commit correspondiente. Usar exclusivamente datos ficticios en las evidencias académicas.

## Servicios y horarios — fase 4

Los servicios se guardan con código visible `SERV-INT-0001`, `SERV-INT-0002`, etc., nombre, descripción, duración en minutos, `precioCentavos`, imagen como URL HTTP(S) o ruta, y estado `ACTIVO` o `INACTIVO`. El código lo asigna un contador atómico, es único e inmutable. El ObjectId se conserva para relaciones internas, pero no se muestra en el detalle administrativo. El formulario muestra el precio en quetzales con dos decimales y separadores de miles; la API recibe centavos enteros. Acepta duraciones enteras de 1 a 1440 minutos y precios de Q1.00 a Q30,000,000.00. El nombre admite letras, números, espacios, guion y guion bajo. Desactivar un servicio conserva su documento.

Para los servicios anteriores, `npm run codigos:servicios -- --db=sigca_dev` o `--db=sigca_test` desde `backend/` asigna códigos por `createdAt` y `_id`, conserva los ya asignados y se puede repetir. Comprueba que la conexión apunta a la base indicada y haz un respaldo antes de ejecutarlo. Mientras queden servicios sin código, el registro nuevo responde 503 para mantener el orden histórico. En producción el comando requiere `--db=sigca_prod --confirmar-produccion`; la URI privada se proporciona fuera del historial de comandos. La asignación no cambia las citas ni las solicitudes existentes.

| Ruta | Acceso | Uso |
| --- | --- | --- |
| `GET /api/servicios` y `GET /api/servicios/:id` | Público | Solo servicios activos; `buscar` filtra por código, nombre o descripción. Un inactivo no aparece ni en el detalle. |
| `GET /api/servicios/administracion` y `GET /api/servicios/administracion/:id` | Administrador y recepcionista | Consulta interna de activos e inactivos; admite `buscar` y `estado` en el listado. |
| `GET /api/servicios/administracion/navegacion` | Administrador y recepcionista | Devuelve los identificadores internos y códigos de todos los servicios activos, ordenados numéricamente por código, para los controles del detalle. |
| `POST /api/servicios`, `PUT /api/servicios/:id`, `PATCH /api/servicios/:id/estado` | Administrador | Registro, modificación y cambio de estado. |

La pantalla pública es `/servicios`; `/gestion-servicios` permite modificar a quienes tengan el permiso correspondiente y consultar a quienes tengan permiso de lectura. Ambos listados se ordenan por código correlativo. El detalle interno permite navegar por todos los servicios activos, en ese mismo orden. Después de crear o actualizar, se ofrece agregar otro servicio o volver al listado. Si se abandona un formulario modificado, aparece una advertencia por cambios sin guardar. El profesional puede consultar los servicios activos públicos. El formulario admite cargar y recortar una imagen mediante Cloudinary o conservar una URL o ruta anterior.

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

Las páginas públicas son `/`, `/servicios`, `/educacion`, `/corporativo`, `/horarios` y `/contacto`. Servicios y horarios consultan las rutas públicas existentes; el administrador sigue usando `/gestion-servicios` y `/gestion-horarios`. El botón **Solicitar cita** abre el formulario de la fase 6. El portal funciona en pantallas estrechas mediante menús flexibles, tarjetas y formularios de una columna.

**Pruebas locales:** desde `backend/`, `npm test` ejecuta pruebas HTTP con modelos simulados para permisos, validaciones, visibilidad y confirmación de contacto, sin tocar Atlas. Desde `frontend/`, `npm run build` compila Vue. No se preparó ni ejecutó una prueba de integración con escritura en `sigca_test` para esta fase. La persistencia real y el aspecto en dispositivos deberán comprobarse por el estudiante antes de publicar o durante la revisión controlada. Esta fase no modifica Render, Vercel ni Atlas desde los scripts de prueba.

Para publicar nuevas fases, primero revisar los commits locales; después, cuando se autorice, enviar `main` al repositorio remoto y confirmar en Render y Vercel que ambos despliegan ese commit. No usar datos reales de pacientes ni mostrar mensajes privados en capturas públicas.

## Solicitudes de citas — fase 6

`/solicitar-cita` permite a un visitante enviar nombre, correo, teléfono, servicio activo, fecha preferida y mensaje adicional opcional. El botón de cada tarjeta de `/servicios` abre el formulario con ese servicio seleccionado; puede cambiarse por otro activo. La API guarda la solicitud en `solicitudesCita` con estado `PENDIENTE`, fecha de creación e identificador. Responde con una confirmación y el identificador propio, sin devolver listados ni datos de otros visitantes. El envío tiene un límite de 10 intentos cada 15 minutos por IP. **La fecha preferida no crea una cita, no asigna profesional y no reserva horario.**

| Ruta | Acceso | Uso |
| --- | --- | --- |
| `POST /api/solicitudes-cita` | Público | Valida y crea una solicitud pendiente. |
| `GET /api/solicitudes-cita?estado=&buscar=` | Administrador y recepcionista | Consulta hasta 100 solicitudes recientes y filtra por estado, nombre, correo o identificador. |
| `GET /api/solicitudes-cita/opciones?buscarPaciente=` | Administrador y recepcionista | Ofrece hasta 100 pacientes activos y 100 profesionales activos para el formulario; se puede buscar al paciente. |
| `GET /api/solicitudes-cita/:id` | Administrador y recepcionista | Muestra el detalle, incluido el identificador de la cita si ya fue atendida. |
| `PATCH /api/solicitudes-cita/:id/rechazar` | Administrador y recepcionista | Rechaza solo una solicitud pendiente; conserva el registro. El cuerpo JSON es `{}`. |
| `POST /api/solicitudes-cita/:id/convertir` | Administrador y recepcionista | Recibe `paciente`, `profesional`, `fecha` y `horaInicio`; crea la cita y atiende la solicitud en una transacción. |

La pantalla protegida `/gestion-solicitudes` muestra lista, filtros, detalle, rechazo y conversión. La persona encargada elige un **paciente ya registrado**, un usuario activo con rol `PROFESIONAL`, fecha efectiva y hora de inicio. La API usa el servicio de la solicitud solo si continúa activo. Guarda en `citas` las referencias a paciente, servicio y profesional; `fecha`, `horaInicio`, `horaFin`, duración y precio en centavos copiados del servicio; y estado inicial `PENDIENTE`. La solicitud atendida conserva la referencia a la cita. Una cita creada así no equivale todavía a una cita confirmada.

Antes de crear, `prepararCita` valida fecha y hora futuras en `America/Guatemala`, entidades activas, duración completa dentro de un intervalo de horario, ausencia de otra cita no cancelada ni completada del profesional en ese intervalo y un responsable existente si el paciente tendrá menos de 18 años ese día. La hora final se calcula con la duración del servicio; la cita debe terminar el mismo día. Si cambia el precio o la duración del servicio después, la cita conserva sus valores históricos.

La conversión usa una transacción de MongoDB y un índice único en `Cita.solicitudCita`: si falla la creación o dos intentos procesan la misma solicitud, no debe quedar una solicitud atendida sin cita ni dos citas del mismo origen. Atlas proporciona las transacciones de un conjunto de réplicas. Además de consultar citas traslapadas antes de crear, la cita guarda internamente los minutos ocupados y un índice único condicionado a los estados `PENDIENTE` y `CONFIRMADA` impide que dos citas de un mismo profesional y fecha ocupen el mismo minuto, incluso en intentos simultáneos. Las citas `CANCELADA` y `COMPLETADA` no bloquean ese índice. No se introducen locks, colas ni servicios adicionales.

**Pendiente para fase 7:** programación general, confirmación, reprogramación, cancelación, finalización, historial, filtros de citas y calendario mensual. Esta fase tampoco incorpora pagos ni caja. El modelo deja opcional `solicitudCita` para que una futura cita creada directamente no dependa de una solicitud pública.

**Verificación local:** `npm test` en `backend/` usa modelos simulados y prueba permisos, validación, rechazo, conversión, duplicados, reglas de agenda y reversión ante un fallo simulado. `npm run build` en `frontend/` compila la interfaz. Se ejecutó además una integración HTTP en una instancia temporal de MongoDB 8 local con réplica de un nodo: se crearon allí administrador, profesional, paciente, servicio, horario, solicitudes y citas ficticias; se verificaron envío sin reserva, cita real persistida, valores históricos, rechazo de conversión duplicada, reversión de una conversión fallida e índice único de traslape. Al terminar se eliminó esa base temporal, se detuvo la instancia y se borró su carpeta. Ninguna de estas pruebas escribió en Atlas. No se ejecutó una integración con `sigca_test` ni se publicaron cambios en producción; queda pendiente la revisión del flujo en el entorno de despliegue autorizado.

## Gestión de citas y calendario — fase 7

Las rutas protegidas `/citas` y `/calendario` permiten programar directamente, consultar, confirmar, reprogramar, cancelar y completar citas, además de verlas por mes y día. La pantalla del paciente consulta su historial real. Las citas nacidas de solicitudes convertidas aparecen en estas consultas sin cambiar sus referencias. `fecha`, `horaInicio` y `horaFin` se guardan como cadenas de fecha y hora de Guatemala; la interfaz muestra `DD/MM/AAAA`, horario de `America/Guatemala` y quetzales con dos decimales.

| API | Uso |
| --- | --- |
| `GET /api/citas?paciente=&profesional=&fecha=&estado=&pagina=` | Lista filtrable de 100 por página. El profesional ve solo sus citas. |
| `GET /api/citas/calendario?mes=AAAA-MM&profesional=` | Cuenta las citas por día y estado en un único mes. El profesional ve solo las propias. |
| `GET /api/citas/opciones?buscarPaciente=` | Pacientes, servicios y profesionales activos para administrador y recepcionista. |
| `GET /api/citas/:id` | Detalle. Al profesional solo se le entrega nombre y código del paciente y no se le envían observaciones administrativas. |
| `POST /api/citas` | Programación directa; no requiere solicitud. |
| `PUT /api/citas/:id` | Reprograma fecha, hora y profesional; conserva paciente, servicio, duración y precio históricos. |
| `PATCH /api/citas/:id/estado` | Cambia estado según rol y transición permitida. |

Administrador y recepcionista pueden programar, consultar, confirmar, reprogramar y cancelar. El profesional solo consulta las citas asignadas y marca como completada una cita propia confirmada. Los nuevos permisos `CITAS_VER` y `CITAS_GESTIONAR` pertenecen únicamente a esos roles predefinidos; no se conceden a roles personalizados. Las transiciones son `PENDIENTE → CONFIRMADA` o `CANCELADA`, y `CONFIRMADA → COMPLETADA` o `CANCELADA`. Una cita completada o cancelada es final y deja libre su horario para otra cita; ningún registro se elimina físicamente.

La programación y reprogramación reutilizan las comprobaciones de paciente, servicio y profesional activos, responsable para menores, horario de atención, fecha y hora futuras, finalización el mismo día y ausencia de traslapes. El índice único de minutos ocupados protege frente a solicitudes simultáneas; si se produce un conflicto, la API responde 409. Al crear se copian duración y precio del servicio, y al reprogramar se conservan los valores de la cita aunque el servicio haya cambiado.

**Pendiente de la fase de pagos:** antes de permitir `CANCELADA`, se deberá consultar si la cita tiene pagos válidos y rechazar la cancelación cuando existan. El punto de integración está identificado junto al cambio de estado; esta fase no implementa ni verifica pagos o caja. No ejecutar pruebas con datos reales de Atlas. `npm test` en `backend/` incluye una instancia temporal local de MongoDB para la fase 7; `npm run build` en `frontend/` comprueba la compilación.

## Mejoras de búsqueda, agenda y detalle de citas

En Programar cita y Convertir solicitud, «Pacientes Activos» consulta la base desde la primera letra, muestra diez resultados por página y permite cargar diez más. La selección se conserva al cambiar otros campos. Las listas de pacientes, responsables, servicios y solicitudes usan páginas de 100 registros; las opciones activas de profesionales y servicios incluyen más de 100. Las opciones se actualizan tras cambios en la misma pestaña, al volver a enfocar la página y cada minuto mientras está visible. La actualización conserva las selecciones elegibles y avisa cuando una opción deja de ser válida.

La API acepta citas desde la hora futura de hoy hasta 365 días calendario después de la fecha actual de Guatemala, inclusive. Aplica a programación, reprogramación y conversión; la solicitud pública también limita su fecha preferida. El frontend muestra los días de espera y pide confirmación antes de guardar. Las citas ya existentes con fechas fuera de ese rango siguen consultables y deben corregirse manualmente desde Citas → Ver detalle → Reprogramar o Cancelar cita, según su estado.

Un cuadro de error común aparece sobre los formularios al fallar una operación o un envío inválido, con foco y marcas en campos cuando corresponde. Los formularios y filtros indican «Obligatorio» u «Opcional», incluidas las condiciones de horarios y carrusel. El detalle de la cita presenta tarjetas de profesional y paciente, valores históricos y acciones por rol. Las fotografías privadas se obtienen por `GET /api/citas/:id/imagenes/paciente` y `/profesional` tras comprobar permiso sobre la cita; la API no entrega direcciones directas de Cloudinary. Las rutas locales antiguas `/imagenes/…` siguen mostrándose. Las fotos heredadas con URL externa no se incluyen en el detalle de la cita porque su privacidad depende del proveedor anterior; el resto de vistas conserva su tratamiento previo.

Las pruebas automatizadas usan una instancia temporal local de MongoDB o modelos simulados y no escriben en Atlas. Para comprobar esta implementación, ejecuta `npm test` desde `backend/` y `npm run build` desde `frontend/`. Las pruebas funcionales de Render y Vercel corresponden al estudiante después de comprobar los commits desplegados, sin crear datos ficticios en producción.

Referencias: [build y monorepos en Vercel](https://vercel.com/docs/builds/configure-a-build), [rewrites de Vercel](https://vercel.com/docs/project-configuration/vercel-json), [variables de Vite](https://vite.dev/guide/env-and-mode), [monorepos de Render](https://render.com/docs/monorepo-support), [versión de Node en Render](https://render.com/docs/node-version), [puerto de servicios web](https://render.com/docs/web-services) y [health checks de Render](https://render.com/docs/health-checks).

## Verificación de correo, recuperación y avisos

Esta función requiere configurar un remitente verificado en Resend. **El código por sí solo no envía correos**. En el backend, copiar los nombres de `backend/.env.example` al entorno correspondiente y configurar `RESEND_API_KEY`, `EMAIL_FROM` (por ejemplo `SIGCA <avisos@dominio-verificado>`), `APP_PUBLIC_URL` (origen HTTPS del frontend, sin ruta) y `SIGCA_CRON_SECRET`. Estos valores son secretos del backend; no se ponen en Vercel, en variables `VITE_*`, en Git ni en capturas. El dominio del remitente debe estar autorizado por el proveedor antes de probar envíos. En desarrollo, usar una cuenta y un remitente de prueba; en Render, usar las variables del servicio de producción.

Para los avisos programados, crear en GitHub Actions el secreto `SIGCA_CRON_SECRET` con el **mismo valor** que en Render, y la variable `SIGCA_API_URL` con la URL base del backend, sin `/api` ni barra final. El flujo `.github/workflows/avisos-correo.yml` llama cada 15 minutos a `POST /api/avisos/procesar`; también puede ejecutarse manualmente desde Actions. El punto de entrada exige el secreto. Los horarios de GitHub Actions son aproximados y Render Free puede tardar en despertar: los recordatorios de 24 y 6 horas son aproximados, y no se prometen al minuto exacto. Si el flujo deja de ejecutarse, los avisos pendientes siguen guardados en MongoDB para reintentarlos cuando vuelva a funcionar.

Al crear un **usuario nuevo**, queda pendiente de verificación y debe usar el enlace recibido antes de ingresar. En su primer ingreso deberá cambiar la contraseña inicial. Las cuentas creadas antes de esta función no se bloquean retroactivamente. El enlace de verificación vence en 6 horas y el de recuperación de contraseña en 1 hora; ambos son de un solo uso. `/verificar-correo` permite pedir otro enlace. `/recuperar-password` permite restablecer una cuenta de usuario con correo verificado; la respuesta no confirma si la cuenta existe. Los enlaces llevan el token en el fragmento `#`, que el frontend retira de la dirección visible al abrir la página. Cambiar contraseña invalida las sesiones anteriores.

El **correo del paciente es opcional**: un menor o una persona sin correo propio puede recibir avisos mediante un responsable asociado con correo verificado. El correo del responsable es obligatorio al registrarlo. Cada dirección debe verificarse antes de recibir avisos. Al crear o cambiar un correo, el formulario indica si pudo enviarse el enlace y muestra el estado pendiente; si falló el envío, se puede solicitar otro enlace en `/verificar-correo`. Los avisos de cita se destinan al paciente, a sus responsables asociados y al profesional, siempre que su correo esté verificado. Se preparan avisos para cita pendiente, confirmada, reprogramada y cancelada; al confirmar, se programan recordatorios de 24 y 6 horas. Un aviso pendiente se descarta si cambian la cita o sus destinatarios antes de enviarlo. Las publicaciones del portal se envían **solo** a correos verificados que hayan elegido expresamente recibirlas; la preferencia se puede cambiar después. No se envían avisos retroactivos por publicaciones anteriores.

El formulario de imagen indica formatos JPG/JPEG, PNG y WebP y límite de 5 MB por archivo; el backend conserva la validación del tipo real y del tamaño. El login permite 10 intentos fallidos por combinación de dirección IP y correo durante 15 minutos, de modo que distintas cuentas en una red compartida no consumen el mismo cupo. Los mensajes de límite indican la espera restante calculada al momento del bloqueo.

**Antes de publicar:** configurar el remitente y las variables en Render y GitHub, comprobar que el servicio de correo funciona con una dirección ficticia propia, y confirmar que los despliegues de backend y frontend corresponden al mismo commit. Sin esas variables, el sistema conserva los registros de pacientes y responsables, pero informa que el enlace no se pudo enviar; la creación de nuevos usuarios se detiene para evitar cuentas inaccesibles. La publicación de código o un `HTTP 200` en `/api/health` no comprueba el envío de correo. No introducir direcciones o fotografías de personas reales en pruebas.
