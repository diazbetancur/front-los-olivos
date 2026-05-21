# Deploy a Vercel

## 0. Prerrequisitos

- Cuenta en [vercel.com](https://vercel.com) (free tier alcanza para SPA).
- Repositorio GitHub `diazbetancur/front-los-olivos` con código pusheado en `main`.
- URL pública del backend (`https://constructora-api.onrender.com` o el dominio custom que hayas asignado).

## 1. Importar el proyecto

1. Vercel dashboard → **Add New** → **Project** → conecta `front-los-olivos`.
2. Vercel detecta el framework como **Angular** automáticamente.
3. La config viene de `vercel.json` (no hace falta tocar Build & Output Settings).

## 2. Variables de entorno

Solo necesitas una (de momento):

| Clave | Valor |
|---|---|
| `API_BASE_URL` | URL pública del backend, **sin slash final**. e.g. `https://constructora-api.onrender.com` |

El script `prebuild` (`scripts/inject-env.mjs`) lee esa variable y reescribe `src/environments/environment.ts` antes de `ng build`. Si la variable no está, deja el archivo como está.

## 3. Configurar el backend para aceptar este origen

Una vez Vercel te dé la URL de producción (`https://<proyecto>.vercel.app`), agrégala en Render como `Cors__AllowedOrigins__0`. Si no, el backend devolverá CORS errors.

## 4. Verificación

1. Vercel build debe completar sin errores.
2. Visita `https://<proyecto>.vercel.app/login`.
3. Login con el admin sembrado en Render.
4. Si ves CORS errors → revisar `Cors__AllowedOrigins__0` en Render.
5. Si las peticiones van a `http://localhost:5123` → el `prebuild` no aplicó la env var (revisa logs del build en Vercel).

## 5. Dominio custom

- Vercel → Project → Settings → Domains → agregar tu dominio.
- TLS gratis automático.
- Después de cambiar el dominio, actualizar `Cors__AllowedOrigins__0` en Render.

## 6. Limitaciones conocidas

- **El `apiBaseUrl` queda baked en el bundle** en build time. Cambiar la URL del backend requiere un re-deploy. (Ya hay un TODO para resolver con `/assets/config.json` runtime; no implementado.)
- **Pre-rendering / SSR no está configurado.** Es un SPA puro.
- **Sin Edge Functions.** El backend Angular no consume rutas serverless de Vercel.
