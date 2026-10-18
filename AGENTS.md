# Reglas de trabajo — SIGCA

Estas instrucciones rigen el trabajo de los asistentes en este repositorio. SIGCA es el proyecto final **individual** del curso de Desarrollo Web de Ingeniería en Sistemas. El estudiante es el único desarrollador; el historial Git debe reflejar su avance individual.

## Alcance y decisiones académicas

- Trabajar por etapas pequeñas y esperar la aprobación del estudiante antes de iniciar la siguiente.
- Mantener el alcance académico solicitado. No implementar SaaS, multi-tenancy, organizaciones, `organizacionId`, suscripciones, planes comerciales ni pagos recurrentes.
- Usar JavaScript, Vue 3, Vite, Vue Router, Pinia, Fetch API, Node.js, Express, MongoDB Atlas y Mongoose. No usar TypeScript ni tecnologías innecesarias.
- Mantener el flujo Vue → API Express → MongoDB Atlas. El frontend nunca debe conectarse directamente a MongoDB.
- Configurar las bases `sigca_dev`, `sigca_test` y `sigca_prod` mediante variables de entorno, sin cambiar el código fuente.
- Representar a los profesionales como usuarios con rol `PROFESIONAL`, salvo necesidad funcional demostrada.
- Mantener una sola fuente de verdad para Paciente–Responsable: referencias a responsables dentro de Paciente y consulta inversa en MongoDB.
- Conservar los conceptos académicos `fecha`, `horaInicio` y `horaFin` para las citas. Mostrar las horas en `America/Guatemala`.
- Usar URL o ruta para fotografías; no guardar binarios en MongoDB ni incorporar almacenamiento externo sin aprobación.
- Manejar el dinero en centavos enteros o una estrategia decimal equivalente. Derivar saldos e ingresos de pagos válidos.
- No permitir anular pagos de cajas cerradas. No introducir locks, colas o servicios adicionales para citas sin consultarlo antes.
- Validar permisos y reglas de negocio en el backend; ocultar controles en Vue no reemplaza la autorización.

## Explicaciones y cambios

- Explicar en español, desde conceptos básicos y sin asumir que el estudiante conoce comandos o herramientas.
- Priorizar la Terminal integrada de VS Code. Para cada comando indicar la carpeta exacta, el comando completo listo para copiar, qué hace y qué resultado se espera.
- Antes de modificar una etapa, explicar su objetivo y enumerar exactamente los archivos que se crearán o modificarán.
- Implementar únicamente la etapa aprobada. Describir mejoras opcionales y esperar aprobación antes de agregarlas.
- Advertir antes de acciones destructivas o que puedan modificar o eliminar información. Consultar antes de cambios estructurales importantes.
- No eliminar funcionalidades existentes sin explicarlo.

## Git, GitHub y secretos

- Usar el repositorio individual y la rama `main`. Hacer commits pequeños, frecuentes y significativos; no preparar colaboradores ni ramas de equipo.
- Antes de cada commit, mostrar `git status`, resumir los cambios y proponer el mensaje.
- Mantener `backend/.env` y cualquier otro `.env` real fuera de Git. Versionar solo ejemplos sin credenciales.
- Nunca incluir en código, commits, capturas o informes `MONGO_URI`, contraseñas, `JWT_SECRET`, tokens ni otras credenciales privadas.
- Las variables `VITE_*` llegan al navegador: no poner secretos en ellas. Configurar URLs de producción mediante variables de entorno, no directamente en componentes.

## Entrega obligatoria al terminar cada etapa de desarrollo

- Presentar un checklist de lo implementado y lo pendiente.
- Separar claramente **PRUEBAS LOCALES** y **PRUEBAS EN PRODUCCIÓN**.
- Para cada prueba indicar carpeta, comandos completos, URLs o endpoints, resultado esperado y qué observar para reconocer el éxito.
- Indicar capturas concretas para evidenciar la etapa y revisar que no muestren secretos.
- No inventar capturas, URLs ni resultados. Si todavía no hay despliegue, escribir: **Producción aún no configurada**.
- Revisar errores y pruebas pertinentes, resumir cambios y commits, y esperar aprobación antes de la siguiente etapa.

## Evidencias e informes académicos

- Reunir evidencias durante el desarrollo para **Avance 1**, **Avance 2** y **Entrega Final**.
- Usar `docs/evidencias/avance-1/`, `docs/evidencias/avance-2/` y `docs/evidencias/entrega-final/` cuando se apruebe crear esa estructura. No guardar capturas con secretos.
- En cada hito, cuando el estudiante entregue sus capturas, ayudar a crear un DOCX editable con portada o espacio para ella, objetivo, funcionalidades, tecnologías, estructura, pruebas, capturas explicadas, problemas, soluciones, commits, estado, conclusiones y pendientes.
- No inventar evidencias ni resultados de pruebas.

## Entornos y despliegue

- Mantener separados los entornos **LOCAL** y **PRODUCCIÓN**.
- Preparar `VITE_API_URL` en el frontend y `PORT`, `MONGO_URI`, `JWT_SECRET` y `CORS_ORIGIN` en el backend cuando corresponda a una etapa aprobada.
- Evaluar Vercel para el frontend, Render para el backend y Atlas para la base de datos. No desplegar ni cambiar servicios externos sin aprobación.
