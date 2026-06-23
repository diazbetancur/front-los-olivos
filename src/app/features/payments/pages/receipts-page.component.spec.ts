import { FormControl, FormGroup } from '@angular/forms';
import { receiptsFilterValidator, toClientOption, toContractOption } from './receipts-page.component';

function group(values: { clientId?: string; contractId?: string; fromDate?: string; toDate?: string }): FormGroup {
  return new FormGroup({
    clientId: new FormControl(values.clientId ?? ''),
    contractId: new FormControl(values.contractId ?? ''),
    fromDate: new FormControl(values.fromDate ?? ''),
    toDate: new FormControl(values.toDate ?? '')
  });
}

describe('receiptsFilterValidator', () => {
  it('requires at least one filter', () => {
    expect(receiptsFilterValidator(group({}))).toEqual({ noFilter: true });
  });

  it('flags an incomplete period', () => {
    expect(receiptsFilterValidator(group({ fromDate: '2026-01-01' }))).toEqual({ periodIncomplete: true });
  });

  it('flags an inverted range', () => {
    expect(receiptsFilterValidator(group({ fromDate: '2026-03-01', toDate: '2026-01-01' }))).toEqual({ dateRange: true });
  });

  it('flags a period longer than 90 days', () => {
    expect(receiptsFilterValidator(group({ fromDate: '2026-01-01', toDate: '2026-05-01' }))).toEqual({ periodTooLong: true });
  });

  it('accepts a client alone', () => {
    expect(receiptsFilterValidator(group({ clientId: 'c1' }))).toBeNull();
  });

  it('accepts a period within 90 days', () => {
    expect(receiptsFilterValidator(group({ fromDate: '2026-01-01', toDate: '2026-03-01' }))).toBeNull();
  });
});

describe('search option mappers', () => {
  it('maps a client to a typed option', () => {
    const option = toClientOption({ id: 'c1', fullName: 'Juan Pérez', status: 'Activo', dni: '0801-1', rtn: '' });
    expect(option).toEqual({ id: 'c1', label: 'Juan Pérez', sublabel: 'Cliente · 0801-1', type: 'client' });
  });

  it('maps a contract to a typed option', () => {
    const option = toContractOption({
      id: 'k1', contractNumber: 'CTR-2026-014', clientFullName: 'Juan Pérez',
      projectId: 'p', lotId: 'l', clientId: 'c1', contractDate: '2026-01-01', contractAmount: 0, currency: 'HNL', status: 'Activo'
    });
    expect(option).toEqual({ id: 'k1', label: 'CTR-2026-014', sublabel: 'Contrato · Juan Pérez', type: 'contract' });
  });
});
