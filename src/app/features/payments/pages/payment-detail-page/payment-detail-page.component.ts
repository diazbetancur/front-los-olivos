import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiErrorService } from '../../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import {
  ContractBalanceResponse,
  ContractInstallmentResponse,
  PaymentDetailResponse
} from '../../models/payments.models';
import { PaymentsApiService } from '../../services/payments-api.service';

@Component({
  selector: 'app-payment-detail-page',
  imports: [CommonModule, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './payment-detail-page.component.html',
  styleUrl: './payment-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  protected readonly feedback = inject(AppFeedbackService);

  readonly payment = signal<PaymentDetailResponse | null>(null);
  readonly balance = signal<ContractBalanceResponse | null>(null);
  readonly schedule = signal<ReadonlyArray<ContractInstallmentResponse>>([]);

  readonly activeTab = signal<'detail' | 'balance'>('detail');

  readonly isLoading = signal(false);
  readonly isFinanceLoading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly financeError = signal<string | null>(null);

  protected paymentId = '';

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Pago no encontrado.');
      return;
    }
    this.paymentId = id;
    this.load();
  }

  goBack(): void {
    void this.router.navigate(['/admin/payments']);
  }

  setTab(tab: 'detail' | 'balance'): void {
    this.activeTab.set(tab);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Aplicado':
        return 'status-badge applied';
      case 'PendienteRevision':
        return 'status-badge pending';
      case 'Rechazado':
      case 'Anulado':
        return 'status-badge blocked';
      default:
        return 'status-badge';
    }
  }

  protected reload(): void {
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.paymentsApi
      .getPaymentById(this.paymentId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.isLoading.set(false);
          this.payment.set(response);
          if (response.contractId) {
            this.loadFinance(response.contractId);
          } else {
            this.balance.set(null);
            this.schedule.set([]);
          }
        },
        error: (error) => {
          this.isLoading.set(false);
          const normalized = this.apiErrorService.normalize(error);
          this.loadError.set(normalized.userMessage);
        }
      });
  }

  private loadFinance(contractId: string): void {
    this.isFinanceLoading.set(true);
    this.financeError.set(null);
    this.balance.set(null);
    this.schedule.set([]);

    this.paymentsApi
      .getContractSchedule(contractId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => this.schedule.set(response),
        error: (error) => {
          const normalized = this.apiErrorService.normalize(error);
          this.financeError.set(normalized.userMessage);
        }
      });

    this.paymentsApi
      .getContractBalance(contractId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.isFinanceLoading.set(false);
          this.balance.set(response);
        },
        error: (error) => {
          this.isFinanceLoading.set(false);
          const normalized = this.apiErrorService.normalize(error);
          this.financeError.set(normalized.userMessage);
        }
      });
  }
}
