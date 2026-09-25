import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PaymentDetailPageComponent } from './payment-detail-page.component';

describe('PaymentDetailPageComponent', () => {
  let component: PaymentDetailPageComponent;
  let fixture: ComponentFixture<PaymentDetailPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaymentDetailPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(PaymentDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('maps status to badge classes', () => {
    expect(component.statusClass('Aplicado')).toBe('status-badge applied');
    expect(component.statusClass('PendienteRevision')).toBe('status-badge pending');
    expect(component.statusClass('Anulado')).toBe('status-badge blocked');
    expect(component.statusClass('Registrado')).toBe('status-badge');
  });

  it('switches the active tab', () => {
    expect(component.activeTab()).toBe('detail');
    component.setTab('balance');
    expect(component.activeTab()).toBe('balance');
  });

  it('toggles the apply modal open and closed', () => {
    component.payment.set({
      id: 'p1', paymentNumber: 'PG-1', contractId: 'c1', clientId: null,
      paymentDate: '2026-06-01', amount: 100, appliedAmount: 0, unallocatedAmount: 100,
      currency: 'HNL', status: 'Registrado', paymentMethod: 'Efectivo', bankName: '',
      transactionReference: '', concept: '', notes: '', voidReason: '', allocations: []
    });
    component.schedule.set([
      { id: 'i1', contractId: 'c1', installmentNumber: 1, dueDate: '2026-07-01', amount: 50,
        principalAmount: 50, interestAmount: 0, lateFeeAmount: 0, paidAmount: 0, remainingAmount: 50, status: 'Pendiente' }
    ]);
    component.openApply();
    expect(component.showApply()).toBe(true);
    expect(component.allocationsArray.length).toBe(1);
    component.cancelApply();
    expect(component.showApply()).toBe(false);
    expect(component.allocationsArray.length).toBe(0);
  });

  it('requires a reason before rejecting', () => {
    component.payment.set({
      id: 'p1', paymentNumber: 'PG-1', contractId: 'c1', clientId: null,
      paymentDate: '2026-06-01', amount: 100, appliedAmount: 0, unallocatedAmount: 100,
      currency: 'HNL', status: 'PendienteRevision', paymentMethod: 'Transferencia', bankName: '',
      transactionReference: '', concept: '', notes: '', voidReason: '', allocations: []
    });
    component.openReject();
    component.submitReject();
    expect(component.rejectForm.invalid).toBe(true);
    expect(component.showReject()).toBe(true);
  });

  it('shows the transfer-proof section only for transfer payments', () => {
    component.payment.set({
      id: 'p1', paymentNumber: 'PG-1', contractId: 'c1', clientId: null,
      paymentDate: '2026-06-01', amount: 100, appliedAmount: 0, unallocatedAmount: 100,
      currency: 'HNL', status: 'PendienteRevision', paymentMethod: 'Transferencia', bankName: '',
      transactionReference: '', concept: '', notes: '', voidReason: '', allocations: [],
      proofs: [{
        id: 'pr1', status: 'PendienteRevision', source: 'cliente', externalReference: 'REF-1',
        paymentDate: '2026-06-01', amount: 100, currency: 'HNL',
        submittedAtUtc: '2026-06-01T12:00:00Z', hasFile: true
      }]
    });
    expect(component.isTransfer()).toBe(true);

    component.payment.set({
      id: 'p2', paymentNumber: 'PG-2', contractId: 'c1', clientId: null,
      paymentDate: '2026-06-01', amount: 100, appliedAmount: 0, unallocatedAmount: 100,
      currency: 'HNL', status: 'Registrado', paymentMethod: 'Efectivo', bankName: '',
      transactionReference: '', concept: '', notes: '', voidReason: '', allocations: []
    });
    expect(component.isTransfer()).toBe(false);
  });

  describe('recibos por cuota', () => {
    const paymentWith = (count: number, withoutReceiptAt: ReadonlyArray<number> = []) => ({
      id: 'p1', paymentNumber: 'PG-1', contractId: 'c1', clientId: null,
      paymentDate: '2026-06-01', amount: 100 * count, appliedAmount: 100 * count,
      unallocatedAmount: 0, currency: 'HNL', status: 'Aplicado', paymentMethod: 'Efectivo',
      bankName: '', transactionReference: '', concept: '', notes: '', voidReason: '',
      allocations: Array.from({ length: count }, (_, index) => {
        const installmentNumber = index + 1;
        const hasReceipt = !withoutReceiptAt.includes(installmentNumber);
        return {
          id: `a${installmentNumber}`,
          paymentId: 'p1',
          contractId: 'c1',
          contractInstallmentId: `i${installmentNumber}`,
          installmentNumber,
          amountApplied: 100,
          isVoided: false,
          appliedAtUtc: '2026-06-01T12:00:00Z',
          hasReceipt,
          receiptId: hasReceipt ? `r${installmentNumber}` : null,
          receiptNumber: hasReceipt ? `RCP-20260601-00${installmentNumber}` : null
        };
      })
    });

    it('no esconde ninguna cuota: un pago de 12 expone las 12', () => {
      // Antes la tabla paginaba de 10 y las dos ultimas cuotas quedaban invisibles.
      component.payment.set(paymentWith(12));

      expect(component.allocations().length).toBe(12);
      expect(component.allocations().map((a) => a.installmentNumber)).toEqual(
        Array.from({ length: 12 }, (_, i) => i + 1)
      );
    });

    it('cuenta los recibos emitidos', () => {
      component.payment.set(paymentWith(12));
      expect(component.receiptsEmitted()).toBe(12);
    });

    it('distingue las cuotas que quedaron sin recibo', () => {
      component.payment.set(paymentWith(12, [3]));

      expect(component.receiptsEmitted()).toBe(11);
      const failed = component.allocations().find((a) => a.installmentNumber === 3);
      expect(failed?.hasReceipt).toBe(false);
      expect(failed?.receiptNumber).toBeNull();
    });

    it('expone el numero de recibo de cada cuota', () => {
      component.payment.set(paymentWith(3));

      expect(component.allocations().map((a) => a.receiptNumber)).toEqual([
        'RCP-20260601-001', 'RCP-20260601-002', 'RCP-20260601-003'
      ]);
    });

    it('renderiza una fila por cuota con su numero de recibo', () => {
      // El componente se crea sin :id en la ruta, asi que ngOnInit deja el error de carga puesto.
      component.loadError.set(null);
      component.payment.set(paymentWith(12));
      fixture.detectChanges();

      const html = (fixture.nativeElement as HTMLElement).innerHTML;
      expect(html).toContain('RCP-20260601-001');
      expect(html).toContain('RCP-20260601-0012');
    });
  });
});
