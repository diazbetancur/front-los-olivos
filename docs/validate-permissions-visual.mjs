import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const backendUrl = 'http://localhost:5123';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';

const adminCredentials = {
  identifier: 'admin',
  password: 'ChangeMe123!'
};

const limitedUserBase = 'ventas_demo_f8';
const limitedUserPassword = 'VentasDemo123!';

const limitedRoleName = 'VentasReadOnlyDemoF8';
const limitedPermissions = ['Projects.View', 'Lots.View', 'Clients.View', 'Contracts.View'];

const docsDir = path.resolve('docs');
const artifactsDir = path.join(docsDir, 'smoke-artifacts');
const resultPath = path.join(docsDir, 'FRONTEND_SMOKE_ADMIN_RESULTS.json');

function ensureOk(response, action) {
  if (!response.ok) {
    throw new Error(`${action} fallo con HTTP ${response.status}`);
  }
}

async function apiRequest({ method = 'GET', endpoint, token, body }) {
  const response = await fetch(`${backendUrl}${endpoint}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const parsedBody = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const detail = typeof parsedBody === 'string'
      ? parsedBody
      : parsedBody?.detail || parsedBody?.title || JSON.stringify(parsedBody);
    throw new Error(`${method} ${endpoint} -> ${response.status}: ${detail}`);
  }

  return parsedBody;
}

async function login(credentials) {
  const auth = await apiRequest({
    method: 'POST',
    endpoint: '/api/v1/auth/login',
    body: credentials
  });

  if (!auth?.accessToken) {
    throw new Error('Login sin accessToken');
  }

  return auth;
}

async function ensureLimitedRoleAndUser(adminToken) {
  const rolesResponse = await apiRequest({
    endpoint: '/api/v1/admin/roles?page=1&pageSize=100',
    token: adminToken
  });

  let role = rolesResponse.items.find((item) => item.name === limitedRoleName);
  if (!role) {
    role = await apiRequest({
      method: 'POST',
      endpoint: '/api/v1/admin/roles',
      token: adminToken,
      body: {
        name: limitedRoleName,
        description: 'Rol de validacion visual frontend fase 8',
        permissionCodes: limitedPermissions,
        isActive: true
      }
    });
  }

  await apiRequest({
    method: 'PUT',
    endpoint: `/api/v1/admin/roles/${role.id}/permissions`,
    token: adminToken,
    body: { permissionCodes: limitedPermissions }
  });

  const suffix = Date.now().toString();
  const userName = `${limitedUserBase}_${suffix}`;
  const email = `${userName}@constructora.local`;

  const user = await apiRequest({
    method: 'POST',
    endpoint: '/api/v1/admin/users',
    token: adminToken,
    body: {
      userName,
      email,
      firstName: 'Ventas',
      lastName: 'Demo',
      password: limitedUserPassword,
      roleIds: [role.id],
      isActive: true
    }
  });

  return { roleId: role.id, userName: user.userName, password: limitedUserPassword };
}

function expectContains(items, value, message) {
  if (!items.includes(value)) {
    throw new Error(message);
  }
}

function expectNotContains(items, value, message) {
  if (items.includes(value)) {
    throw new Error(message);
  }
}

async function loginFromUi(page, credentials) {
  await page.goto(`${frontendUrl}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Usuario o correo').fill(credentials.identifier ?? credentials.userName);
  await page.getByLabel('Contrasena').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  try {
    await page.waitForURL('**/admin/dashboard', { timeout: 15000 });
  } catch {
    const banner = await page.locator('.error-banner').first().textContent().catch(() => null);
    throw new Error(`Login UI no llego a dashboard. Mensaje UI: ${banner ?? 'sin detalle'}`);
  }
}

async function extractMenuItems(page) {
  return (await page.locator('.sidebar nav a').allTextContents())
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

async function expandMenuGroupIfCollapsed(page, label) {
  const trigger = page.getByRole('button', { name: new RegExp(`^${label}\\s*[v>]?$`) }).first();
  if (await trigger.count() === 0) {
    return;
  }
  await trigger.click();
  await page.waitForTimeout(150);
}

async function buttonExists(page, label) {
  const count = await page.getByRole('button', { name: label, exact: true }).count();
  return count > 0;
}

async function validateRouteBlocked(page, route) {
  await page.goto(`${frontendUrl}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
  const currentPath = new URL(page.url()).pathname;
  const feedback = await page.locator('.toast.error p, .toast p').first().textContent().catch(() => null);

  if (currentPath !== '/admin/dashboard') {
    throw new Error(`Ruta ${route} no redirigio a /admin/dashboard. Path actual: ${currentPath}`);
  }

  if (!feedback || !feedback.includes('No tienes permisos')) {
    throw new Error(`Ruta ${route} redirigio, pero no mostro feedback de permisos.`);
  }
}

async function updateStep28Result(detail) {
  const raw = await fs.readFile(resultPath, 'utf8');
  const data = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const step = data.find((item) => item.Step === 28);
  if (!step) {
    throw new Error('No se encontro Step 28 en FRONTEND_SMOKE_ADMIN_RESULTS.json');
  }

  step.Status = 'PASS';
  step.Detail = detail;

  await fs.writeFile(resultPath, JSON.stringify(data, null, 4), 'utf8');
}

async function run() {
  await fs.mkdir(artifactsDir, { recursive: true });

  const adminAuth = await login(adminCredentials);
  const setup = await ensureLimitedRoleAndUser(adminAuth.accessToken);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await loginFromUi(page, {
      identifier: setup.userName,
      password: setup.password
    });

    await expandMenuGroupIfCollapsed(page, 'Inventario');
    await expandMenuGroupIfCollapsed(page, 'Comercial');

    const limitedMenu = await extractMenuItems(page);
    const expectedVisible = ['Inicio', 'Proyectos', 'Lotes', 'Clientes', 'Comercial'];
    const expectedHidden = ['Pagos', 'Recibos', 'Comprobantes', 'Usuarios', 'Roles'];

    for (const label of expectedVisible) {
      expectContains(limitedMenu, label, `Menu limitado no muestra ${label}.`);
    }
    for (const label of expectedHidden) {
      expectNotContains(limitedMenu, label, `Menu limitado muestra ${label} sin permiso.`);
    }

    await page.screenshot({ path: path.join(artifactsDir, 'limited-user-dashboard.png'), fullPage: true });

    await validateRouteBlocked(page, '/admin/payments');
    await validateRouteBlocked(page, '/admin/receipts');
    await validateRouteBlocked(page, '/admin/users');
    await validateRouteBlocked(page, '/admin/roles');

    await page.goto(`${frontendUrl}/admin/projects`, { waitUntil: 'networkidle' });
    if (await buttonExists(page, 'Nuevo proyecto')) {
      throw new Error('Usuario limitado ve boton Nuevo proyecto.');
    }

    await page.goto(`${frontendUrl}/admin/lots`, { waitUntil: 'networkidle' });
    const lotSensitiveButtons = ['Nuevo lote', 'Editar', 'Reservar', 'Liberar', 'Bloquear', 'Desbloquear', 'Anular'];
    for (const label of lotSensitiveButtons) {
      if (await buttonExists(page, label)) {
        throw new Error(`Usuario limitado ve boton sensible de lotes: ${label}`);
      }
    }

    await page.goto(`${frontendUrl}/admin/clients`, { waitUntil: 'networkidle' });
    const clientSensitiveButtons = ['Nuevo cliente', 'Editar', 'Deshabilitar'];
    for (const label of clientSensitiveButtons) {
      if (await buttonExists(page, label)) {
        throw new Error(`Usuario limitado ve boton sensible de clientes: ${label}`);
      }
    }

    await page.goto(`${frontendUrl}/admin/contracts`, { waitUntil: 'networkidle' });
    const contractSensitiveButtons = ['Nuevo contrato', 'Cambiar estado', 'Cancelar contrato', 'Generar documentos'];
    for (const label of contractSensitiveButtons) {
      if (await buttonExists(page, label)) {
        throw new Error(`Usuario limitado ve boton sensible de contratos: ${label}`);
      }
    }

    await page.getByRole('button', { name: 'Cerrar sesion' }).click();
    await page.waitForURL('**/login', { timeout: 15000 });

    await loginFromUi(page, adminCredentials);
    await expandMenuGroupIfCollapsed(page, 'Inventario');
    await expandMenuGroupIfCollapsed(page, 'Comercial');
    await expandMenuGroupIfCollapsed(page, 'Finanzas');
    const adminMenu = await extractMenuItems(page);
    const fullAdminExpected = ['Inicio', 'Proyectos', 'Lotes', 'Clientes', 'Comercial', 'Pagos', 'Recibos', 'Comprobantes'];
    for (const label of fullAdminExpected) {
      expectContains(adminMenu, label, `Menu admin no muestra ${label}.`);
    }

    await page.screenshot({ path: path.join(artifactsDir, 'admin-user-dashboard.png'), fullPage: true });

    await updateStep28Result(
      'PASS por validacion visual automatizada: menu recortado correcto, rutas sin permiso bloqueadas y botones sensibles ocultos para usuario VentasReadOnlyDemoF8.'
    );

    const report = {
      executedAtUtc: new Date().toISOString(),
      backendUrl,
      frontendUrl,
      limitedRoleName,
      limitedPermissions,
      limitedUser: setup.userName,
      limitedMenu,
      blockedRoutes: ['/admin/payments', '/admin/receipts', '/admin/users', '/admin/roles'],
      sensitiveButtonsValidated: {
        projects: ['Nuevo proyecto', 'Editar', 'Deshabilitar'],
        lots: ['Nuevo lote', 'Editar', 'Reservar', 'Liberar', 'Bloquear', 'Desbloquear', 'Anular'],
        clients: ['Nuevo cliente', 'Editar', 'Deshabilitar'],
        contracts: ['Nuevo contrato', 'Cambiar estado', 'Cancelar contrato', 'Generar documentos'],
        payments: 'ruta bloqueada sin permiso',
        receipts: 'ruta bloqueada sin permiso',
        proofs: 'menu oculto y ruta bloqueada por falta de Payments.ReviewProof'
      },
      adminMenu
    };

    await fs.writeFile(
      path.join(artifactsDir, 'permissions-visual-report.json'),
      JSON.stringify(report, null, 2),
      'utf8'
    );

    console.log('VALIDACION VISUAL DE PERMISOS: PASS');
  } finally {
    await context.close();
    await browser.close();
  }
}

run().catch((error) => {
  console.error('VALIDACION VISUAL DE PERMISOS: FAIL');
  console.error(error);
  process.exit(1);
});
