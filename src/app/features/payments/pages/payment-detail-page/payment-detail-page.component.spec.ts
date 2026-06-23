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
});
