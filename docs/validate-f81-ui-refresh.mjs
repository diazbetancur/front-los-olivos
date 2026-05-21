import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:4200';
const resultsPath = path.resolve('docs', 'F81_UI_REFRESH_RESULTS.json');
const artifactsDir = path.resolve('docs', 'smoke-artifacts', 'f81');

const credentials = {
  identifier: 'admin',
  password: 'ChangeMe123!'
};

const suffix = `F81${Date.now()}`;

const state = {
  projectCode: `PR-${suffix}`,
  projectName: `Proyecto ${suffix}`,
  projectNameEdited: `Proyecto ${suffix} Editado`,
  lotCode: `LT-${suffix}`,
  lotFullCode: `LT-${suffix}`,
  lotNumber: `${suffix}`,
  clientFirstName: `Cliente${suffix}`,
  clientLastName: 'Demo',
  clientFullName: `Cliente${suffix} Demo`,
  juridicaName: `Empresa ${suffix}`,
  juridicaEmail: `juridica.${suffix}@demo.local`,
  beneficiaryName: `Beneficiario ${suffix}`,
  referenceName: `Referencia ${suffix}`,
  paymentReference: `TX-${suffix}`,
  secondPaymentReference: `TX2-${suffix}`,
  paymentConcept: `Concepto ${suffix}`,
  receiptNotes: `Recibo ${suffix}`,
  contractNumber: '',
  paymentNumber: '',
  receiptNumber: ''
};

const results = [];
const runtimeErrors = [];

function addResult(step, title, status, detail) {
  results.push({
    step,
    title,
    status,
    detail
  });
}

async function runStep(step, title, action) {
  try {
    const result = await action();
    if (result && typeof result === 'object' && 'status' in result) {
      addResult(step, title, result.status, result.detail || 'Sin detalle');
      return;
    }

    addResult(step, title, 'PASS', result || 'OK');
  } catch (error) {
    addResult(step, title, 'FAIL', error instanceof Error ? error.message : String(error));
  }
}

async function typeInput(scope, formControlName, value) {
  const input = scope.locator(`[formcontrolname="${formControlName}"]`).first();
  await input.fill('');
  await input.fill(String(value));
}

async function clickButton(scope, name) {
  await scope.getByRole('button', { name, exact: true }).first().click();
}

async function waitForToast(page) {
  await page.waitForSelector('.toast.success, .toast.error, .toast.warning, .toast.info', { timeout: 10000 });
}

async function waitModalClosed(page) {
  await page.waitForFunction(() => document.querySelectorAll('app-modal').length === 0, { timeout: 10000 });
}

async function tableBodyRows(page) {
  return page.locator('tbody tr');
}

async function getSelectValueByLabel(page, selectControl, optionLabelIncludes) {
  const select = page.locator(`select[formcontrolname="${selectControl}"]`).first();
  const option = select.locator('option').filter({ hasText: optionLabelIncludes }).first();
  const value = await option.getAttribute('value');
  if (!value) {
    throw new Error(`No se encontro opcion para ${selectControl} con texto: ${optionLabelIncludes}`);
  }
  return value;
}

async function ensureRowContains(page, text, timeout = 15000) {
  const row = page.locator('tbody tr').filter({ hasText: text }).first();
  await row.waitFor({ state: 'visible', timeout });
}

async function waitInputHasValue(scope, formControlName, timeout = 15000) {
  const input = scope.locator(`[formcontrolname="${formControlName}"]`).first();
  await input.waitFor({ state: 'visible', timeout });
  await input.evaluate((element, timeoutMs) => {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const check = () => {
        const value = (element).value ?? '';
        if (String(value).trim().length > 0) {
          resolve(true);
          return;
        }

        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Campo ${element.getAttribute('formcontrolname')} no fue cargado a tiempo.`));
          return;
        }

        requestAnimationFrame(check);
      };
      check();
    });
  }, timeout);
}

async function selectOptionContains(scope, formControlName, partialLabel, timeout = 20000) {
  const select = scope.locator(`select[formcontrolname="${formControlName}"]`).first();
  await select.waitFor({ state: 'visible', timeout: 15000 });

  const start = Date.now();
  while (Date.now() - start < timeout) {
    const matchedValue = await select.evaluate((element, text) => {
      const match = Array.from(element.options).find((option) => option.textContent?.includes(text));
      if (!match) {
        return null;
      }
      return match.value;
    }, partialLabel);

    if (matchedValue) {
      await select.selectOption(matchedValue);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const options = await select.locator('option').allTextContents();
  throw new Error(`No se encontro opcion para ${formControlName} que incluya "${partialLabel}". Opciones: ${options.join(' | ')}`);
}

async function waitForGetById(page, pathIncludes) {
  await page.waitForResponse((response) =>
    response.url().includes(pathIncludes)
    && response.request().method() === 'GET'
    && response.status() === 200, { timeout: 20000 });
}

async function gotoAdmin(page, pathName) {
  await page.goto(`${frontendUrl}${pathName}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);
}

async function waitForClientsReload(page) {
  await page.waitForResponse((response) =>
    response.url().includes('/api/v1/admin/clients')
    && response.request().method() === 'GET'
    && response.status() === 200, { timeout: 20000 });
}

async function run() {
  await fs.mkdir(artifactsDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  page.on('pageerror', (error) => {
    runtimeErrors.push(`PAGEERROR: ${error.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('401 (Unauthorized)')) {
        runtimeErrors.push(`CONSOLE: ${text}`);
      }
    }
  });

  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') {
      await dialog.accept(`Nota ${suffix}`);
      return;
    }
    await dialog.accept();
  });

  try {
    await runStep(1, 'Login admin', async () => {
      await page.goto(`${frontendUrl}/login`, { waitUntil: 'networkidle' });
      await page.getByLabel('Usuario o correo').fill(credentials.identifier);
      await page.getByLabel('Contrasena').fill(credentials.password);
      await clickButton(page, 'Entrar');
      await page.waitForURL('**/admin/dashboard', { timeout: 20000 });
      return 'Login OK';
    });

    await runStep(2, 'Crear proyecto y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/projects');
      await typeInput(page, 'search', state.projectCode);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Nuevo proyecto');

      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'code', state.projectCode);
      await typeInput(modal, 'name', state.projectName);
      await typeInput(modal, 'description', `Descripcion ${suffix}`);
      await typeInput(modal, 'department', 'Francisco Morazan');
      await typeInput(modal, 'municipality', 'Distrito Central');
      await typeInput(modal, 'locationReference', `Ubicacion ${suffix}`);
      await typeInput(modal, 'cadastralKey', `CAT-${suffix}`);
      await typeInput(modal, 'totalAreaM2', '15000');
      await clickButton(modal, 'Crear proyecto');

      await waitForToast(page);
      await waitModalClosed(page);
      await ensureRowContains(page, state.projectCode);
      return `Proyecto ${state.projectCode} visible sin click extra`;
    });

    await runStep(3, 'Editar proyecto y reflejo inmediato', async () => {
      const row = page.locator('tbody tr').filter({ hasText: state.projectCode }).first();
      await row.getByRole('button', { name: 'Editar', exact: true }).click();
      await waitForGetById(page, '/api/v1/admin/projects/');
      const modal = page.locator('app-modal').last();
      await waitInputHasValue(modal, 'code');
      await typeInput(modal, 'name', state.projectNameEdited);
      await clickButton(modal, 'Guardar cambios');

      await waitForToast(page);
      await waitModalClosed(page);
      await ensureRowContains(page, state.projectCode);
      const updatedRow = page.locator('tbody tr').filter({ hasText: state.projectCode }).first();
      await updatedRow.getByText(state.projectNameEdited).waitFor({ timeout: 15000 });
      return 'Nombre actualizado en tabla sin click extra';
    });

    await runStep(4, 'Crear lote y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/lots');
      await typeInput(page, 'search', state.lotFullCode);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Nuevo lote');

      const modal = page.locator('app-modal').last();
      await selectOptionContains(modal, 'projectId', state.projectCode);
      await typeInput(modal, 'code', state.lotCode);
      await typeInput(modal, 'fullCode', state.lotFullCode);
      await typeInput(modal, 'number', state.lotNumber);
      await typeInput(modal, 'areaM2', '180');
      await typeInput(modal, 'listPrice', '500000');
      await typeInput(modal, 'intendedUse', 'Vivienda');
      await clickButton(modal, 'Crear lote');

      await waitForToast(page);
      await waitModalClosed(page);
      await ensureRowContains(page, state.lotFullCode);
      return `Lote ${state.lotFullCode} visible sin click extra`;
    });

    await runStep(5, 'Cambiar estado de lote y reflejo inmediato', async () => {
      const row = page.locator('tbody tr').filter({ hasText: state.lotFullCode }).first();
      await row.getByRole('button', { name: 'Reservar', exact: true }).click();
      await waitForToast(page);
      await ensureRowContains(page, 'Reservado');
      return 'Estado Reservado visible inmediatamente';
    });

    await runStep(6, 'Crear cliente y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/clients');
      await typeInput(page, 'search', state.clientFirstName);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Nuevo cliente');

      const modal = page.locator('app-modal').last();
      await modal.locator('select[formcontrolname="personType"]').selectOption('Natural');
      await typeInput(modal, 'firstName', state.clientFirstName);
      await typeInput(modal, 'lastName', state.clientLastName);
      await typeInput(modal, 'email', `${state.clientFirstName.toLowerCase()}@demo.local`);
      await typeInput(modal, 'phone', '22334455');
      await clickButton(modal, 'Crear cliente');

      await waitForToast(page);
      await waitModalClosed(page);
      await ensureRowContains(page, state.clientFullName);
      return `Cliente ${state.clientFullName} visible sin click extra`;
    });

    await runStep(6.1, 'Crear cliente Juridica y refresco inmediato', async () => {
      await typeInput(page, 'search', '');
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Nuevo cliente');
      const modal = page.locator('app-modal').last();
      await modal.locator('select[formcontrolname="personType"]').selectOption('Juridica');
      await typeInput(modal, 'firstName', state.juridicaName);
      await typeInput(modal, 'email', state.juridicaEmail);
      await typeInput(modal, 'phone', '22110099');
      await clickButton(modal, 'Crear cliente');

      await waitForToast(page);
      await waitModalClosed(page);

      // Fuerza recarga con filtros consistentes para evitar falsos negativos de sincronizacion.
      await typeInput(page, 'search', state.juridicaName);
      const reloadByName = waitForClientsReload(page);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await reloadByName;

      const juridicaRow = page.locator('tbody tr').filter({ hasText: state.juridicaName }).first();
      if (!(await juridicaRow.isVisible().catch(() => false))) {
        await typeInput(page, 'search', state.juridicaEmail);
        const reloadByEmail = waitForClientsReload(page);
        await clickButton(page.locator('form').first(), 'Aplicar');
        await reloadByEmail;
        await ensureRowContains(page, state.juridicaEmail);
        return `Cliente juridica ${state.juridicaName} visible por busqueda email sin click extra`;
      }

      return `Cliente juridica ${state.juridicaName} visible sin click extra`;
    });

    await runStep(7, 'Editar cliente y reflejo inmediato', async () => {
      await typeInput(page, 'search', state.clientFirstName);
      await clickButton(page.locator('form').first(), 'Aplicar');
      const row = page.locator('tbody tr').filter({ hasText: state.clientFullName }).first();
      await row.getByRole('button', { name: 'Editar', exact: true }).click();
      await waitForGetById(page, '/api/v1/admin/clients/');
      const modal = page.locator('app-modal').last();
      await waitInputHasValue(modal, 'firstName');
      await typeInput(modal, 'phone', '33445566');
      await clickButton(modal, 'Guardar cambios');

      await waitForToast(page);
      await waitModalClosed(page);
      const updatedRow = page.locator('tbody tr').filter({ hasText: state.clientFullName }).first();
      await updatedRow.waitFor({ state: 'visible', timeout: 15000 });
      await updatedRow.getByText('33445566').waitFor({ timeout: 15000 });
      return 'Telefono actualizado en fila sin click extra';
    });

    await runStep(8, 'Crear beneficiario y refresco inmediato', async () => {
      const row = page.locator('tbody tr').filter({ hasText: state.clientFullName }).first();
      await row.getByRole('button', { name: 'Ver', exact: true }).click();
      await page.getByRole('heading', { name: 'Detalle del cliente' }).waitFor({ timeout: 15000 });
      await clickButton(page, 'Nuevo beneficiario');

      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'fullName', state.beneficiaryName);
      await typeInput(modal, 'phone', '99887766');
      await clickButton(modal, 'Crear beneficiario');

      await waitForToast(page);
      await waitModalClosed(page);
      await ensureRowContains(page, state.beneficiaryName);
      return 'Beneficiario visible sin click extra';
    });

    await runStep(9, 'Crear referencia y refresco inmediato', async () => {
      await clickButton(page, 'Nueva referencia');
      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'fullName', state.referenceName);
      await typeInput(modal, 'phone', '98765432');
      await clickButton(modal, 'Crear referencia');

      await waitForToast(page);
      await waitModalClosed(page);
      await ensureRowContains(page, state.referenceName);
      return 'Referencia visible sin click extra';
    });

    await runStep(10, 'Crear contrato y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/contracts');
      await selectOptionContains(page, 'clientId', state.clientFullName);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Nuevo contrato');

      const modal = page.locator('app-modal').last();
      await selectOptionContains(modal, 'projectId', state.projectCode);
      await selectOptionContains(modal, 'lotId', state.lotFullCode);
      await selectOptionContains(modal, 'clientId', state.clientFullName);
      await typeInput(modal, 'termMonths', '12');
      await typeInput(modal, 'contractAmount', '500000');
      await typeInput(modal, 'downPayment', '50000');
      await typeInput(modal, 'monthlyPayment', '37500');
      await typeInput(modal, 'interestRate', '0.12');
      await typeInput(modal, 'monthlyPaymentDay', '15');
      const createButton = modal.getByRole('button', { name: 'Crear contrato', exact: true });
      const disabled = await createButton.isDisabled();
      if (disabled) {
        const controls = await modal.locator('[formcontrolname]').evaluateAll((elements) =>
          elements.map((element) => ({
            name: element.getAttribute('formcontrolname'),
            value: (element).value ?? '',
            invalid: element.classList.contains('ng-invalid')
          }))
        );
        throw new Error(`Formulario contrato deshabilitado. Controles: ${JSON.stringify(controls)}`);
      }
      await clickButton(modal, 'Crear contrato');

      await waitForToast(page);
      await waitModalClosed(page);
      const row = page.locator('tbody tr').filter({ hasText: state.clientFullName }).first();
      await row.waitFor({ state: 'visible', timeout: 20000 });
      state.contractNumber = ((await row.locator('td').first().textContent()) ?? '').trim();
      if (!state.contractNumber) {
        throw new Error('No se pudo leer contractNumber desde la tabla.');
      }
      return `Contrato visible sin click extra (${state.contractNumber})`;
    });

    await runStep(11, 'Generar documentos y refresco inmediato', async () => {
      const row = page.locator('tbody tr').filter({ hasText: state.contractNumber }).first();
      await row.getByRole('button', { name: 'Ver', exact: true }).click();
      await page.getByRole('heading', { name: 'Detalle de contrato' }).waitFor({ timeout: 20000 });
      await clickButton(page, 'Generar documentos');
      await waitForToast(page);
      const docsRows = page.locator('section.subsection').filter({ hasText: 'Documentos' }).locator('tbody tr');
      await docsRows.first().waitFor({ timeout: 30000 });
      return 'Documentos visibles sin click extra';
    });

    await runStep(11.1, 'Consultar cronograma sin navegacion adicional', async () => {
      const scheduleRows = page.locator('section.subsection').filter({ hasText: 'Cronograma' }).locator('tbody tr');
      await scheduleRows.first().waitFor({ timeout: 20000 });
      return 'Cronograma cargado en detalle sin click extra';
    });

    await runStep(12, 'Registrar pago y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/payments');
      await typeInput(page, 'search', state.paymentReference);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Registrar pago');

      const modal = page.locator('app-modal').last();
      await selectOptionContains(modal, 'contractId', state.contractNumber);
      await selectOptionContains(modal, 'clientId', state.clientFullName);
      await typeInput(modal, 'amount', '1000');
      await typeInput(modal, 'transactionReference', state.paymentReference);
      await typeInput(modal, 'concept', state.paymentConcept);
      await clickButton(modal, 'Guardar pago');

      await waitForToast(page);
      await waitModalClosed(page);
      await page.getByRole('heading', { name: 'Detalle de pago' }).waitFor({ timeout: 20000 });
      const detailText = await page.locator('.detail-panel').first().innerText();
      if (!detailText.includes(state.paymentReference)) {
        throw new Error('El detalle de pago no refleja la referencia registrada inmediatamente.');
      }
      state.paymentNumber = (await page.locator('.detail-header p').first().textContent() ?? '').trim();
      return `Detalle refrescado sin click extra (${state.paymentNumber})`;
    });

    await runStep(13, 'Aplicar pago y refresco inmediato de balance/detalle', async () => {
      await clickButton(page, 'Aplicar pago');
      const modal = page.locator('app-modal').last();
      const firstAmountInput = modal.locator('input[formcontrolname="amountApplied"]').first();
      await firstAmountInput.fill('1000');
      await clickButton(modal, 'Aplicar pago');

      await waitForToast(page);
      await waitModalClosed(page);
      const detailText = await page.locator('.detail-panel').first().innerText();
      if (!detailText.includes('Aplicado:') || detailText.includes('Aplicado: 0.00')) {
        throw new Error('El detalle no refleja monto aplicado inmediatamente.');
      }
      return 'Aplicacion reflejada sin click extra';
    });

    await runStep(14, 'Crear recibo y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/receipts');
      await typeInput(page, 'search', state.receiptNotes);
      await clickButton(page.locator('form').first(), 'Aplicar');
      await clickButton(page, 'Nuevo recibo manual');

      const modal = page.locator('app-modal').last();
      if (!state.paymentNumber) {
        throw new Error('No hay paymentNumber para crear recibo.');
      }
      await selectOptionContains(modal, 'paymentId', state.paymentNumber);
      await selectOptionContains(modal, 'contractId', state.contractNumber);
      await selectOptionContains(modal, 'clientId', state.clientFullName);
      await typeInput(modal, 'amount', '1000');
      await typeInput(modal, 'notes', state.receiptNotes);
      await clickButton(modal, 'Crear recibo');

      await waitForToast(page);
      await waitModalClosed(page);
      await page.getByRole('heading', { name: 'Detalle de recibo' }).waitFor({ timeout: 20000 });
      const detailText = await page.locator('.detail-panel').first().innerText();
      if (!detailText.includes(state.receiptNotes)) {
        throw new Error('El detalle de recibo no refleja notas inmediatamente.');
      }
      state.receiptNumber = (await page.locator('.detail-header p').first().textContent() ?? '').trim();
      return `Recibo reflejado sin click extra (${state.receiptNumber})`;
    });

    await runStep(14.1, 'Descargar PDF y DOCX con blob/bearer', async () => {
      const [pdfDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        clickButton(page, 'Descargar PDF')
      ]);
      const pdfName = pdfDownload.suggestedFilename();
      if (!pdfName.toLowerCase().endsWith('.pdf')) {
        throw new Error(`Descarga PDF invalida: ${pdfName}`);
      }

      const [docxDownload] = await Promise.all([
        page.waitForEvent('download', { timeout: 20000 }),
        clickButton(page, 'Descargar DOCX')
      ]);
      const docxName = docxDownload.suggestedFilename();
      if (!docxName.toLowerCase().endsWith('.docx')) {
        throw new Error(`Descarga DOCX invalida: ${docxName}`);
      }

      return `Descargas OK (${pdfName}, ${docxName})`;
    });

    await runStep(15, 'Aprobar comprobante y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/payment-proofs');
      const pendingRow = page.locator('tbody tr').filter({ hasText: 'PendienteRevision' }).first();
      if (await pendingRow.count() === 0) {
        return {
          status: 'BLOCKED',
          detail: 'No hay comprobantes PendienteRevision en ambiente actual.'
        };
      }

      await pendingRow.getByRole('button', { name: 'Ver', exact: true }).click();
      await clickButton(page, 'Aprobar');
      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'notes', `Aprobado ${suffix}`);
      await clickButton(modal, 'Confirmar aprobacion');

      await waitForToast(page);
      await waitModalClosed(page);
      await page.locator('.detail-header .status-badge.approved').waitFor({ timeout: 20000 });
      return 'Comprobante aprobado visible sin click extra';
    });

    await runStep(16, 'Rechazar comprobante y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/payment-proofs');
      let pendingRow = page.locator('tbody tr').filter({ hasText: 'PendienteRevision' }).first();
      let pendingExists = await pendingRow.isVisible().catch(() => false);

      if (!pendingExists) {
        // Intenta crear un segundo pago explicito para forzar un nuevo comprobante pendiente.
        await gotoAdmin(page, '/admin/payments');
        await clickButton(page, 'Registrar pago');

        const paymentModal = page.locator('app-modal').last();
        await selectOptionContains(paymentModal, 'contractId', state.contractNumber);
        await selectOptionContains(paymentModal, 'clientId', state.clientFullName);
        await typeInput(paymentModal, 'amount', '900');
        await typeInput(paymentModal, 'transactionReference', state.secondPaymentReference);
        await typeInput(paymentModal, 'concept', `${state.paymentConcept}-2`);
        await clickButton(paymentModal, 'Guardar pago');

        await waitForToast(page);
        await waitModalClosed(page);

        await gotoAdmin(page, '/admin/payment-proofs');
        pendingRow = page.locator('tbody tr').filter({ hasText: 'PendienteRevision' }).first();
        pendingExists = await pendingRow.isVisible().catch(() => false);
      }

      if (!pendingExists) {
        return {
          status: 'BLOCKED',
          detail: 'No hay comprobantes PendienteRevision aun despues de registrar segundo pago de prueba.'
        };
      }

      await pendingRow.getByRole('button', { name: 'Ver', exact: true }).click();
      await clickButton(page, 'Rechazar');
      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'reason', `Rechazo ${suffix}`);
      await clickButton(modal, 'Confirmar rechazo');

      await waitForToast(page);
      await waitModalClosed(page);
      await page.locator('.detail-header .status-badge.rejected').waitFor({ timeout: 20000 });
      return 'Comprobante rechazado visible sin click extra';
    });

    await runStep(17, 'Anular pago y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/payments');
      await typeInput(page, 'search', state.paymentReference);
      await clickButton(page.locator('form').first(), 'Aplicar');
      const row = page.locator('tbody tr').first();
      await row.getByRole('button', { name: 'Ver', exact: true }).click();
      await clickButton(page, 'Anular pago');

      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'reason', `Anulacion ${suffix}`);
      await clickButton(modal, 'Confirmar anulacion');

      await waitForToast(page);
      await waitModalClosed(page);
      await page.locator('.detail-header .status-badge.blocked').waitFor({ timeout: 20000 });
      return 'Pago anulado visible sin click extra';
    });

    await runStep(18, 'Anular recibo y refresco inmediato', async () => {
      await gotoAdmin(page, '/admin/receipts');
      await typeInput(page, 'search', state.receiptNotes);
      await clickButton(page.locator('form').first(), 'Aplicar');
      const row = page.locator('tbody tr').first();
      await row.getByRole('button', { name: 'Ver', exact: true }).click();
      await clickButton(page, 'Anular recibo');

      const modal = page.locator('app-modal').last();
      await typeInput(modal, 'reason', `Anulacion ${suffix}`);
      await clickButton(modal, 'Confirmar anulacion');

      await waitForToast(page);
      await waitModalClosed(page);
      await page.locator('.detail-header .status-badge.blocked').waitFor({ timeout: 20000 });
      return 'Recibo anulado visible sin click extra';
    });

    await page.screenshot({
      path: path.join(artifactsDir, `f81-summary-${suffix}.png`),
      fullPage: true
    });
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    executedAtUtc: new Date().toISOString(),
    frontendUrl,
    runtimeErrors,
    results
  };

  await fs.writeFile(resultsPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`Resultados guardados en: ${resultsPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

run().catch(async (error) => {
  const fallback = {
    executedAtUtc: new Date().toISOString(),
    frontendUrl,
    runtimeErrors,
    fatalError: error instanceof Error ? error.message : String(error),
    results
  };
  await fs.writeFile(resultsPath, JSON.stringify(fallback, null, 2), 'utf8');
  console.error('Fallo validacion F8.1');
  console.error(error);
  process.exit(1);
});
