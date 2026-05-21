# Frontend Admin Smoke (Fase 7-8)

## Prerequisitos

- Backend activo en `http://localhost:5123`.
- Frontend activo en `http://localhost:4200`.
- Usuario admin dev:
  - `admin / ChangeMe123!`

## Configuracion usada

- Backend URL: `http://localhost:5123`
- Frontend URL: `http://localhost:4200`
- Fecha de ejecucion: `2026-05-10`

## Ejecucion de smoke

Se ejecuto smoke funcional completo contra endpoints reales del backend:

- [run-smoke-admin.ps1](./run-smoke-admin.ps1)
- Resultado bruto: [FRONTEND_SMOKE_ADMIN_RESULTS.json](./FRONTEND_SMOKE_ADMIN_RESULTS.json)

Se ejecuto validacion visual de permisos (Fase 8):

- [validate-permissions-visual.mjs](./validate-permissions-visual.mjs)
- [permissions-visual-report.json](./smoke-artifacts/permissions-visual-report.json)
- Evidencias PNG:
  - [limited-user-dashboard.png](./smoke-artifacts/limited-user-dashboard.png)
  - [admin-user-dashboard.png](./smoke-artifacts/admin-user-dashboard.png)

Para Fase 8 se genero automaticamente un usuario limitado de prueba con rol `VentasReadOnlyDemoF8` y permisos:

- `Projects.View`
- `Lots.View`
- `Clients.View`
- `Contracts.View`

## Resultado por paso

| Paso | Resultado | Nota |
| --- | --- | --- |
| 1-27 | PASS | Flujo completo OK: login, inventario, clientes, contratos, cronograma, documentos, pagos, recibos, comprobantes, anulaciones, filtros, logout y 401. |
| 28 | PASS | Validacion visual completada: menu recortado, rutas sin permiso bloqueadas y botones sensibles ocultos. |

Resumen cuantitativo:

- PASS: `28`
- FAIL: `0`
- BLOCKED: `0`

## Errores encontrados

- No se detectaron errores funcionales bloqueantes.
- Incidencia inicial durante la validacion visual:
  - CORS al correr UI en `http://localhost:4201`.
  - Solucion aplicada: correr la validacion en `http://localhost:4200` (origen permitido por backend).

## Fixes aplicados en Fase 7-8

1. Lazy loading por rutas con `loadComponent` en [app.routes.ts](../src/app/app.routes.ts).
2. Dashboard base mejorado con accesos rapidos permission-aware en:
   - [admin-dashboard.component.ts](../src/app/features/admin/dashboard/admin-dashboard.component.ts)
   - [admin-dashboard.component.html](../src/app/features/admin/dashboard/admin-dashboard.component.html)
   - [admin-dashboard.component.scss](../src/app/features/admin/dashboard/admin-dashboard.component.scss)
3. Automatizacion de validacion visual de permisos con Playwright:
   - [validate-permissions-visual.mjs](./validate-permissions-visual.mjs)
4. Hardening UX Fase 8:
   - Overlay global de carga (`GlobalLoadingService` + interceptor HTTP).
   - Toast global reutilizable para success/error/warning/info.
   - Patron modal reutilizable para create/edit/actions criticas.
   - Sin inputs manuales de GUID en formularios operativos.
   - Fix de reactividad post-HTTP con `http-ui-sync.interceptor`.
   - Ajuste de payload frontend para create/update de clientes (null-safe).

## Bundle budget

- Antes: warning por `initial` ~`544 kB` sobre budget `500 kB`.
- Despues de lazy loading: `initial total 283.12 kB` (sin warning).
- No fue necesario subir budget.

## Validaciones tecnicas

- `npm run typecheck` OK
- `npm run build` OK

## Evidencia de permisos visuales (Paso 28)

- Menu visible para usuario limitado:
  - `Dashboard`, `Inventario`, `Proyectos`, `Lotes`, `Clientes`, `Contratos`
- Menu oculto para usuario limitado:
  - `Pagos`, `Recibos`, `Comprobantes`, `Usuarios`, `Roles`
- Rutas bloqueadas y redireccionadas a dashboard:
  - `/admin/payments`
  - `/admin/receipts`
  - `/admin/users`
  - `/admin/roles`
- Botones sensibles ocultos:
  - Proyectos: `Nuevo proyecto`, `Editar`, `Deshabilitar`
  - Lotes: `Nuevo lote`, `Editar`, `Reservar`, `Liberar`, `Bloquear`, `Desbloquear`, `Anular`
  - Clientes: `Nuevo cliente`, `Editar`, `Deshabilitar`
  - Contratos: `Nuevo contrato`, `Cambiar estado`, `Cancelar contrato`, `Generar documentos`
- Admin conserva menu completo de modulos operativos tras relogin.
- `Usuarios` y `Roles` permanecen ocultos temporalmente en menu (`Proximamente`) para no exponer rutas no listas en demo.

## Checklist final demo MVP

- [x] Login admin funcional.
- [x] Navegacion admin permission-aware funcional.
- [x] Inventario (proyectos/lotes) funcional.
- [x] Clientes (incluye beneficiarios/referencias) funcional.
- [x] Contratos (crear, detalle, cronograma, documentos) funcional.
- [x] Pagos (registro, aplicacion, anulacion) funcional.
- [x] Recibos (crear manual, descargar, anular) funcional.
- [x] Comprobantes (aprobar/rechazar) funcional.
- [x] Manejo 401/403/409 con feedback consistente.
- [x] Build y typecheck limpios.
- [x] Bundle inicial optimizado con lazy loading.
- [x] Paso 28 cerrado (permisos visuales validados).

## Gaps pendientes para produccion

1. Convertir smoke visual a pipeline CI (Playwright) si QA lo requiere.
2. Revisar politicas de rotacion/limpieza para usuarios de prueba creados en ambientes compartidos.
3. Habilitar modulo de `Usuarios/Roles` en frontend cuando se cierre su UX funcional completa.

## Addendum F8.1A-F8.1B (2026-05-11)

### Contexto de validacion

- Backend: `http://localhost:5123`
- Frontend: `http://localhost:4200`

### Resultado F8.1A

- `Crear contrato` corregido.
- Causa raiz: `hasCreateSelections` estaba implementado como `computed` leyendo `FormControl.value` no reactivo.
- Fix aplicado: `hasCreateSelections` paso a metodo normal evaluado en tiempo real desde template.

### Resultado F8.1B

- Contratos: crear, abrir detalle, consultar cronograma y generar documentos = `PASS`.
- Pagos: registrar, aplicar y anular = `PASS`.
- Recibos: crear, descargar PDF/DOCX y anular = `PASS`.
- Comprobantes: aprobar y rechazar = `PASS`.

### Fixes F8.1B

- `hasRegisterReferences` paso de `computed` a metodo normal.
- `hasManualReferences` paso de `computed` a metodo normal.

### Confirmacion

`Validado F8.1B: contratos, documentos, pagos, recibos y comprobantes refrescan sin click extra.`

### Gaps pendientes

- Pendiente corrida completa `F8.1C`.
- Pendiente `F8.2` de UX/UI polish.

## Addendum F8.1C (2026-05-11)

### Contexto

- Backend: `http://localhost:5123`
- Frontend: `http://localhost:4200`
- Script ejecutado: `node ./docs/validate-f81-ui-refresh.mjs`
- Fecha/hora corrida: `2026-05-11T15:15:41.162Z` (UTC)

### Resultado final F8.1C

- PASS: `21`
- FAIL: `0`
- BLOCKED: `0`

Todos los pasos del flujo principal quedaron en `PASS`, incluyendo:

- Step 6.1 cliente juridica (validado via busqueda robusta y recarga de lista).
- Step 16 rechazar comprobante (con creacion explicita de segundo pago en el script cuando no habia `PendienteRevision`).

### Confirmacion

`Validado F8.1C: ningun flujo principal requiere click extra para refrescar.`

## Addendum F8.2A (2026-05-11)

### Resultado visual por pantalla

- Shell admin: `PASS`
- Dashboard: `PASS`
- Proyectos: `MINOR`
- Lotes: `PASS`
- Clientes: `PASS`
- Contratos: `PASS`
- Pagos: `PASS`
- Recibos: `PASS`
- Comprobantes: `PASS`
- Responsive ancho medio: `MINOR`

### Confirmacion

`F8.2 validada visualmente para demo MVP.`

### Gaps visuales no bloqueantes

- Tabla de lotes densa en `1024px`.
- Revisar posible solapamiento de toasts en demo humana con muchas acciones seguidas.

### Validaciones

- `npm run typecheck` OK
- `npm run build` OK

## Addendum F9 Seguridad Admin (2026-05-11)

### Alcance implementado

- Usuarios.
- Roles.
- Permisos.
- Asignacion de permisos a roles.
- Menu Seguridad habilitado.

### Rutas

- `/admin/users`
- `/admin/roles`

### Servicios y DTOs creados

- `UsersApiService`
- `RolesApiService`
- `PermissionsApiService`
- `security.models.ts`

### Resultado smoke Fase 9

- Login admin: `PASS`
- Seguridad visible: `PASS`
- `/admin/users`: `PASS`
- Listar usuarios: `PASS`
- Crear usuario: `PASS`
- Editar usuario: `PASS`
- Deshabilitar usuario: `PASS`
- `/admin/roles`: `PASS`
- Listar roles: `PASS`
- Crear rol: `PASS`
- Editar rol: `PASS`
- Cargar permisos: `PASS`
- Asignar permisos: `PASS`
- Guardar permisos: `PASS`
- Toast: `PASS`
- Sin GUIDs visibles: `PASS`

### Fix F9.1

- Causa: el lookup de roles en Usuarios usaba `pageSize=500`.
- Restriccion backend: `PageSize` maximo permitido `100`.
- Fix aplicado: `LOOKUP_PAGE_SIZE=100` en `users-page.component.ts`.

### Validaciones

- `npm run typecheck` OK
- `npm run build` OK

### Confirmacion

`Fase 9 Seguridad Admin queda cerrada: Users/Roles/Permissions funcionales en frontend.`

## Addendum F11 Reportes Administrativos (2026-05-12)

### Alcance

- Endpoints backend de reportes y auditoria habilitados:
  - `/api/v1/admin/reports/lots/status-summary`
  - `/api/v1/admin/reports/contracts/status-summary`
  - `/api/v1/admin/reports/contracts/in-arrears`
  - `/api/v1/admin/reports/payments/by-date-range`
  - `/api/v1/admin/reports/balances/by-project`
  - `/api/v1/admin/reports/receipts/voided`
  - `/api/v1/admin/audit-logs`
- Frontend habilitado en `/admin/reports` con filtros, resumenes y tablas.

### Permisos

- `Reports.View`
- `Audit.View`
- Nota: se reutiliza `Audit.View`; no se separo `AuditLogs.View`.

### Resultado smoke F11

- Login admin: `PASS`
- `/admin/reports`: `PASS`
- Resumen lotes: `PASS`
- Resumen contratos: `PASS`
- Pagos por rango: `PASS`
- Saldos por proyecto: `PASS`
- Recibos anulados: `PASS`
- Auditoria: `PASS`

### Validaciones

- `npm run typecheck` OK
- `npm run build` OK

### Confirmacion

`Fase 11 Reportes Administrativos queda cerrada funcionalmente.`
