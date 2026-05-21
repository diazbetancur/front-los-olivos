# Frontend Admin

Frontend administrativo de Constructora (Angular standalone).

## Scripts

```bash
npm install
npm run start
npm run typecheck
npm run build
```

## Configuracion de API por ambiente

La URL base de API se define por `environment.apiBaseUrl`:

- Desarrollo: `src/environments/environment.development.ts`
- Produccion: `src/environments/environment.ts`

Valores actuales:

- Dev: `http://localhost:5123`
- Prod: `https://api.constructora.example.com` (placeholder, reemplazar por host real)

### Como funciona

1. Los servicios usan rutas relativas (por ejemplo `/api/v1/auth/login`).
2. `ApiBaseUrlInterceptor` concatena `environment.apiBaseUrl` al request.
3. En `ng serve` se usa `environment.development.ts` (configurado en `angular.json`).

## Cambiar la API en desarrollo

Edita:

```text
src/environments/environment.development.ts
```

Actualiza `apiBaseUrl` al backend objetivo (local o remoto).

## Cambiar la API en produccion

Edita:

```text
src/environments/environment.ts
```

Actualiza `apiBaseUrl` al host real de produccion.
