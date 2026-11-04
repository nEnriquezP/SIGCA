# SIGCA — Fase 9: verificación pendiente

Estado al 3 de noviembre de 2026: código de las subetapas 9.2A, 9.2B, 9.3 y 9.4 preparado y probado localmente sin navegador. Las pruebas manuales y de producción continúan pendientes. El estado de publicación debe comprobarse por separado en Render y Vercel.

El documento original de RF-10 y RN-15 a RN-30 no está en el repositorio. La correspondencia académica definitiva exige contrastar ese documento cuando se facilite.

## Contrato preparado

- `GET /api/pagos`: administrador y recepcionista; filtros `paciente`, `fecha` de Guatemala y `metodo`, con `pagina` de 50 registros. Incluye registros anulados para conservar el historial.
- `GET /api/pagos/:id`: administrador y recepcionista. El motivo y usuario de anulación solo se entregan al administrador.
- `GET /api/citas/:id/pagos` y `GET /api/citas/:id/saldo`: administrador y recepcionista. El saldo se deriva del precio histórico y pagos `REGISTRADO`.
- `PATCH /api/pagos/:id/anular`: solo administrador, con `{ "motivo": "..." }`. Exige caja abierta, conserva el documento y usa transacción con Cita y Caja.
- La vista `/pagos` permite consulta, abonos, saldo, historial, caja propia mínima y anulación administrativa. El navegador envía centavos enteros y conserva `solicitudId` por intento en la sesión de la pestaña.

## PRUEBAS LOCALES EJECUTADAS

**No ejecutar contra Atlas ni bases persistentes.** Los tests de integración usan `mongod` temporal en `127.0.0.1` y eliminan sus datos al terminar. Antes de ejecutarlos, revisar de nuevo que el entorno sea aislado.

Desde la Terminal integrada de VS Code, carpeta `backend/`:

```sh
cd "/Users/nelsonenriquez/Documents/Ingenieria 2026/Ciclo VIII/Desarrollo Web/Proyecto SIGCA/backend"
npm test
```

Resultado observado: 56 pruebas aprobadas, 0 fallidas y 2 omitidas. Las pruebas financieras usaron una réplica MongoDB temporal local e incluyeron consultas, filtros, saldos, permisos, anulación, cierre y carreras. Se actualizó una prueba antigua de Caja que esperaba erróneamente HTTP 404 para la consulta de pagos, ahora implementada.

Desde `frontend/`:

```sh
cd "/Users/nelsonenriquez/Documents/Ingenieria 2026/Ciclo VIII/Desarrollo Web/Proyecto SIGCA/frontend"
npm test
npm run build
```

Resultado observado: 7 pruebas aprobadas, 0 fallidas; compilación de Vite completada sin errores.

Desde la raíz del repositorio:

```sh
cd "/Users/nelsonenriquez/Documents/Ingenieria 2026/Ciclo VIII/Desarrollo Web/Proyecto SIGCA"
git diff --check
git status --short --branch
```

Resultado observado: `git diff --check` sin errores y cambios de fase 9 visibles en `main`. Los dos DOCX previos en `docs/` siguen fuera de cualquier selección para commit.

## Pruebas manuales pendientes

Confirmar **privadamente** que frontend y backend apuntan a un entorno de prueba aislado antes de escribir. No compartir archivos `.env`, URI, tokens, contraseñas ni capturas con secretos.

1. Administrador: abrir caja propia, buscar paciente, elegir cita, registrar abono y saldo completo, ver comprobante e historial, anular con motivo y comprobar el nuevo saldo.
2. Recepcionista: consultar pagos y registrar en su propia caja; verificar que no aparezca el control de anulación y que `PATCH /api/pagos/:id/anular` responda 403.
3. Profesional: verificar ausencia de `/pagos` en el menú y respuesta 403 en las rutas financieras.
4. Filtros: paciente, fecha de Guatemala, método y paginación. Revisar registros anulados y fechas cercanas a medianoche.
5. Reintento: simular un fallo de red después del envío y repetir el mismo intento; debe verse un solo comprobante. Cambiar importe genera un intento nuevo.
6. Concurrencia: dos pagos que juntos superan el saldo, pago y cierre, anulación y cierre, anulación y cancelación. Confirmar invariantes en MongoDB **temporal**.
7. Caja: cerrar, revisar efectivo esperado y diferencia; intentar pagar o anular después del cierre y esperar 409.
8. Interfaz: recargar la página, revisar estado financiero, tablas y formularios en escritorio y móvil.

Capturas sugeridas sin secretos: caja abierta, saldo antes y después del abono, comprobante interno, historial con pago anulado, cierre con diferencia y mensaje de permiso denegado.

## PRUEBAS EN PRODUCCIÓN PENDIENTES

Al redactar este registro, no se habían realizado escrituras ni pruebas de pagos en producción. El estudiante solicitó publicar sin usar su navegador. Antes de atribuir cualquier resultado a fase 9, confirmar qué commit quedó activo en Render y Vercel. La revisión visual y funcional de la interfaz permanece pendiente por preferencia del estudiante. El alcance académico debe contrastarse con el documento original si se facilita; registrar por separado cualquier resultado real de producción.
