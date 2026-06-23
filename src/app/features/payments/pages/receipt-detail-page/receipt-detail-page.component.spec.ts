import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ReceiptDetailPageComponent } from './receipt-detail-page.component';

describe('ReceiptDetailPageComponent', () => {
  let component: ReceiptDetailPageComponent;
  let fixture: ComponentFixture<ReceiptDetailPageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReceiptDetailPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptDetailPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('maps status to badge classes', () => {
    expect(component.statusClass('Emitido')).toBe('status-badge emitted');
    expect(component.statusClass('Anulado')).toBe('status-badge blocked');
  });

  it('requires a reason before voiding', () => {
    component.receipt.set({
      id: 'r1', receiptNumber: 'REC-1', paymentId: null, contractId: null, clientId: null,
      receiptDate: '2026-06-01', amount: 100, currency: 'HNL', status: 'Emitido', notes: '',
      generatedAtUtc: '2026-06-01T12:00:00Z', generatedBy: 'tester', voidReason: ''
    });
    component.openVoid();
    component.submitVoid();
    expect(component.voidForm.invalid).toBe(true);
    expect(component.showVoid()).toBe(true);
  });
});
