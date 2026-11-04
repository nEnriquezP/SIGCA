# SIGCA — Entrega final académica

Esta lista se basa en *PROYECTO FINAL INTEGRADOR*. El estudiante confirmó que el ingeniero autorizó desarrollar el proyecto individualmente. La consigna original menciona grupos de tres; en la defensa debe explicarse que todas las responsabilidades corresponden al único autor. No se marcan capturas ni pruebas manuales como realizadas por el solo hecho de existir código.

## Código y datos ficticios

- [x] Frontend Vue 3 y API Express con modelos Mongoose y ejemplos `.env.example` sin credenciales.
- [x] Módulos de pacientes, responsables, servicios, solicitudes, citas, materiales, pagos y caja en el repositorio.
- [x] `backend/scripts/cargarDatosFicticios.js`: carga idempotente y transaccional **solo** en `sigca_dev` o `sigca_test`. Prevista para 1 administrador, 2 recepcionistas, 3 profesionales, 10 pacientes, 5 responsables, 5 servicios, 15 citas, 5 materiales, 5 solicitudes, 10 pagos y 3 cajas, además de asignaciones, contenido institucional y horarios. Nunca se ejecuta en `sigca_prod`.
- [x] El README explica que los controladores HTTP residen dentro de `backend/src/routes/` y la lógica compartida dentro de `backend/src/services/`; no hay carpeta `controllers/` independiente.
- [ ] Ejecutar la carga en una base de pruebas autorizada y conservar el resumen numérico. No presentar resultados de la prueba temporal como si procedieran de Atlas.

La carga utiliza direcciones `example.test`, fotos de marcador y enlaces de recursos ficticios. No envía correos ni incorpora datos reales. Las cuentas de demostración reciben una contraseña temporal proporcionada **privadamente** mediante `SIGCA_DEMO_PASSWORD`; no debe publicarse en el repositorio, capturas, Postman o informes. En un entorno de pruebas, ejecutar primero la simulación y revisar que la base conectada coincida exactamente con el argumento. `--aplicar` es el único modo que escribe; una segunda ejecución no duplica el conjunto.

## Colección Postman

- [x] `postman/SIGCA.postman_collection.json` contiene solicitudes de los módulos principales, incluidos materiales, asignaciones, pagos y caja.
- [ ] Importarla y probar los flujos con un entorno privado de `sigca_test`. Completar `baseUrl`, token, identificadores y fechas con valores ficticios. No exportar la colección o el entorno con token, contraseña o URL privada.

## Verificaciones y evidencias

- [x] Confirmar el commit `bb9fc21` en ambos despliegues: GitHub marcó completado Vercel y Render devolvió `version: "bb9fc21d3454"` el 4 de noviembre de 2026.
- [ ] Recorrido manual local y en producción con roles administrador, recepcionista y profesional. No crear pagos ficticios sobre información real de `sigca_prod`.
- [ ] Capturas reales, sin secretos ni datos personales, del portal público, administración, pacientes, calendario, materiales, pagos y caja diaria. Describir qué verifica cada captura.
- [ ] Revisar responsive en escritorio y móvil y registrar resultados observados.
- [ ] Comprobar y capturar la nueva portada, el encabezado editable, las cinco imágenes sin recorte, las transiciones y los controles del carrusel; verificar el guardado desde Administración. La compilación local no sustituye esta revisión visual.
- [ ] Preparar informe editable de entrega final y defensa con problemas, soluciones, pruebas y conclusiones reales. No inventar evidencias.
- [ ] Generar el ZIP final **a partir de archivos versionados**; excluir `node_modules`, `.env` reales y los dos DOCX previos sin seguimiento, salvo que el estudiante apruebe incluirlos por separado.
- [ ] Subir ZIP y enlace del repositorio a Canvas según las instrucciones vigentes del curso; confirmar fecha y formato de entrega en Canvas.

## Estado de publicación de códigos MAT/CAJ

El código visible de materiales (`MAT-0001`…) y cajas (`CAJ-0001`…) es adicional al ObjectId interno. El estudiante confirmó que observó los tres códigos de materiales y `CAJ-0001` en producción; las capturas de caja posteriores muestran además `CAJ-0002`. Conservar capturas sin datos sensibles como evidencia. Para otros entornos, `backend/scripts/asignarCodigosMaterialesCajas.js` comprueba el nombre de la base y conserva la simulación y aplicación explícita. Si existen registros anteriores sin código, las nuevas altas de materiales o cajas responden `503` para preservar el orden histórico.
