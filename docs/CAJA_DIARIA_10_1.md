# SIGCA — Consultas de caja diaria 10.1

RF-11 del documento original exige consultar ingresos por método, total, efectivo esperado y cierres anteriores. RN-19 a RN-30 exigen excluir pagos anulados de los totales, conservar el historial, impedir movimientos en cajas cerradas y registrar auditoría. Esta subetapa agrega lectura protegida; apertura, pago, anulación y cierre ya existían.

## Fecha operativa de Guatemala

`fechaOperativa` se fija con la fecha de `America/Guatemala` **al abrir** la caja y permanece inmutable. Si una caja sigue abierta después de medianoche, los pagos posteriores continúan asociados a esa misma caja y se incluyen en sus ingresos y en el cierre. El filtro `fechaOperativa` usa la fecha de apertura, no la fecha individual de cada pago. No se implementa cierre automático.

## Lecturas de la API

- `GET /api/cajas`: página de 50 cajas, ordenadas por apertura descendente. Acepta `pagina`, `estado` (`ABIERTA` o `CERRADA`) y `fechaOperativa` (`AAAA-MM-DD`). Solo el administrador puede usar `usuarioResponsable` como filtro. El administrador ve todas; recepción ve exclusivamente sus propias cajas.
- `GET /api/cajas/actual`: conserva `{ "caja": null }` cuando no existe una caja propia abierta. Si existe, añade a `caja` los totales vigentes por método, ingresos válidos y efectivo esperado.
- `GET /api/cajas/:id`: muestra una caja autorizada. En una caja abierta, los totales se calculan desde pagos `REGISTRADO`. En una cerrada, `caja` muestra los importes **guardados al cierre** y `conciliacion` compara esos importes con los pagos válidos actuales. Una discrepancia se señala con `coincide: false`; la lectura nunca corrige ni sobrescribe el cierre.
- `GET /api/cajas/:id/movimientos`: página de 50 pagos de esa caja, incluidos los `ANULADO`, con comprobante, importe, método, estado y auditoría. El administrador puede ver el motivo de anulación; recepción ve fecha y usuario de anulación, conforme al alcance de lectura de pagos ya existente.

Las rutas exigen sesión y permiso `CAJA_HISTORIAL_VER`, salvo `/actual`, que mantiene `CAJA_VER_PROPIA`. Un profesional recibe 403. Para recepción, una caja ajena y una inexistente devuelven el mismo 404; la consulta por `usuarioResponsable` está reservada al administrador. IDs, filtros y páginas inválidos reciben 400.

La vista Vue de caja se incorporó en 10.2. En la revisión 10.3, la suite completa del backend terminó con 63 pruebas aprobadas, 0 fallidas y 2 omitidas mediante MongoDB temporal local; el frontend terminó con 9 aprobadas, 0 fallidas y una compilación correcta. La verificación manual de la interfaz y la comprobación del despliegue siguen pendientes. No se han publicado estos cambios.
