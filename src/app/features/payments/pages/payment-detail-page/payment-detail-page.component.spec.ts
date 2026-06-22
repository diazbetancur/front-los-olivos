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
});
