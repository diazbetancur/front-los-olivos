import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ApiErrorService } from '../../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { AuthSessionService } from '../../../../core/auth/auth-session.service';
import { AppModalComponent } from '../../../../shared/components/app-modal/app-modal.component';
import { HasPermissionDirective } from '../../../../core/auth/has-permission.directive';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { StatusLabelPipe } from '../../../../shared/pipes/status-label.pipe';
import {
  ApplyPaymentRequest,
  ContractBalanceResponse,
  ContractInstallmentResponse,
  PaymentAllocationResponse,
  PaymentApplyResultResponse,
  PaymentDetailResponse,
  PaymentProofSummaryResponse,
  VoidPaymentRequest
} from '../../models/payments.models';
import { PaymentsApiService } from '../../services/payments-api.service';
import { ReceiptsApiService } from '../../services/receipts-api.service';

type AllocationFormGroup = FormGroup<{
  contractInstallmentId: FormControl<string>;
  installmentNumber: FormControl<number>;
  dueDate: FormControl<string>;
  remainingAmount: FormControl<number>;
  amountApplied: FormControl<number | null>;
}>;

@Component({
  selector: 'app-payment-detail-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    HasPermissionDirective,
    LoadingStateComponent,
    EmptyStateComponent,
    StatusLabelPipe
  ],
  templateUrl: './payment-detail-page.component.html',
  styleUrl: './payment-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaymentDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly receiptsApi = inject(ReceiptsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  protected readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canApply = computed(() => this.authSession.hasPermission('Payments.Apply'));
  readonly canVoid = computed(() => this.authSession.hasPermission('Payments.Void'));
  readonly canReview = computed(() => this.authSession.hasPermission('Payments.ReviewProof'));
  readonly canDownloadReceipt = computed(() => this.authSession.hasPermission('Receipts.Print'));
  readonly canGenerateReceipt = computed(() => this.authSession.hasPermission('Receipts.Generate'));

  readonly payment = signal<PaymentDetailResponse | null>(null);
  readonly balance = signal<ContractBalanceResponse | null>(null);
  readonly schedule = signal<ReadonlyArray<ContractInstallmentResponse>>([]);

  readonly activeTab = signal<'detail' | 'balance'>('detail');

  readonly isLoading = signal(false);
  readonly isFinanceLoading = signal(false);
  readonly isSubmitting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly financeError = signal<string | null>(null);

  readonly busyAllocationId = signal<string | null>(null);

  readonly allocationsPageSize = signal(10);
  readonly allocationsPage = signal(1);

  readonly pagedAllocations = computed(() => {
    const all = this.payment()?.allocations ?? [];
    const size = this.allocationsPageSize();
    const start = (this.allocationsPage() - 1) * size;
    return all.slice(start, start + size);
  });

  readonly allocationsTotalPages = computed(() => {
    const total = this.payment()?.allocations?.length ?? 0;
    return Math.max(1, Math.ceil(total / this.allocationsPageSize()));
  });

  prevAllocationsPage(): void {
    if (this.allocationsPage() > 1) {
      this.allocationsPage.update((page) => page - 1);
    }
  }

  nextAllocationsPage(): void {
    if (this.allocationsPage() < this.allocationsTotalPages()) {
      this.allocationsPage.update((page) => page + 1);
    }
  }

  readonly isTransfer = computed(() => this.payment()?.paymentMethod === 'Transferencia');
  readonly busyProofId = signal<string | null>(null);

  readonly appliedPercent = computed(() => {
    const current = this.payment();
    if (!current || current.amount <= 0) {
      return 0;
    }
    const percent = Math.round((current.appliedAmount / current.amount) * 100);
    return Math.min(100, Math.max(0, percent));
  });

  readonly showApply = signal(false);
  readonly showVoid = signal(false);
  readonly showReject = signal(false);
  readonly showCreditConfirm = signal(false);
  readonly creditConfirmAmount = signal(0);

  readonly applySubmitted = signal(false);
  readonly voidSubmitted = signal(false);
  readonly rejectSubmitted = signal(false);
  readonly applyError = signal<string | null>(null);
  readonly voidError = signal<string | null>(null);
  readonly rejectError = signal<string | null>(null);

  readonly applyForm = this.formBuilder.nonNullable.group({
    allocations: this.formBuilder.array<AllocationFormGroup>([])
  });

  readonly voidForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]]
  });

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]]
  });

  private paymentId = '';

  get allocationsArray(): FormArray<AllocationFormGroup> {
    return this.applyForm.controls.allocations;
  }

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

  proofStatusClass(status: string): string {
    switch (status) {
      case 'Aprobado':
        return 'status-badge applied';
      case 'Rechazado':
        return 'status-badge blocked';
      default:
        return 'status-badge pending';
    }
  }

  viewProof(proof: PaymentProofSummaryResponse): void {
    if (!proof.hasFile || this.busyProofId() !== null) {
      return;
    }
    this.busyProofId.set(proof.id);
    this.paymentsApi
      .downloadProofContent(proof.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busyProofId.set(null))
      )
      .subscribe({
        next: (response) => {
          const blob = response.body;
          if (!blob) {
            this.feedback.showError('No se recibió el archivo del comprobante.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const opened = globalThis.open(url, '_blank', 'noopener,noreferrer');
          if (!opened) {
            this.feedback.showError('El navegador bloqueó la apertura del comprobante. Permite las ventanas emergentes.');
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: (error) => {
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
        }
      });
  }

  // --- Aprobar (transferencia pendiente) ---

  approve(confirmCreditBalance = false): void {
    const current = this.payment();
    if (!current) {
      return;
    }
    this.isSubmitting.set(true);
    this.paymentsApi
      .approvePayment(current.id, { confirmCreditBalance })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result: PaymentApplyResultResponse) => {
          this.isSubmitting.set(false);
          if (result.requiresCreditConfirmation) {
            this.creditConfirmAmount.set(result.projectedCreditBalance);
            this.showCreditConfirm.set(true);
            return;
          }
          this.feedback.showSuccess('Pago aprobado: aplicado y recibo emitido.');
          this.reload();
        },
        error: (error) => {
          this.isSubmitting.set(false);
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
        }
      });
  }

  confirmCredit(): void {
    this.showCreditConfirm.set(false);
    this.approve(true);
  }

  cancelCredit(): void {
    this.showCreditConfirm.set(false);
  }

  // --- Rechazar ---

  openReject(): void {
    this.rejectSubmitted.set(false);
    this.rejectError.set(null);
    this.rejectForm.reset({ reason: '' });
    this.showReject.set(true);
  }

  cancelReject(): void {
    this.showReject.set(false);
    this.rejectError.set(null);
  }

  submitReject(): void {
    const current = this.payment();
    this.rejectSubmitted.set(true);
    this.rejectError.set(null);
    if (!current || this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      return;
    }
    this.isSubmitting.set(true);
    this.paymentsApi
      .rejectPayment(current.id, { reason: this.rejectForm.getRawValue().reason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.feedback.showSuccess('Pago rechazado.');
          this.showReject.set(false);
          this.reload();
        },
        error: (error) => {
          this.isSubmitting.set(false);
          const normalized = this.apiErrorService.normalize(error);
          this.rejectError.set(normalized.userMessage);
          this.feedback.showError(normalized.userMessage);
        }
      });
  }

  // --- Anular ---

  openVoid(): void {
    this.voidSubmitted.set(false);
    this.voidError.set(null);
    this.voidForm.reset({ reason: '' });
    this.showVoid.set(true);
  }

  cancelVoid(): void {
    this.showVoid.set(false);
    this.voidError.set(null);
  }

  submitVoid(): void {
    const current = this.payment();
    this.voidSubmitted.set(true);
    this.voidError.set(null);
    if (!current || this.voidForm.invalid) {
      this.voidForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(`Se anulara el pago ${current.paymentNumber}. Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    const payload: VoidPaymentRequest = { reason: this.voidForm.getRawValue().reason.trim() };
    this.isSubmitting.set(true);
    this.paymentsApi
      .voidPayment(current.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.feedback.show({ level: 'success', text: 'Pago anulado correctamente.' });
          this.showVoid.set(false);
          this.reload();
        },
        error: (error) => {
          this.isSubmitting.set(false);
          const normalized = this.apiErrorService.normalize(error);
          this.voidError.set(normalized.userMessage);
          this.feedback.showError(
            normalized.status === 409 ? `Conflicto al anular pago: ${normalized.userMessage}` : normalized.userMessage
          );
        }
      });
  }

  // --- Aplicar a cuotas ---

  openApply(): void {
    const current = this.payment();
    if (!current?.contractId) {
      this.applyError.set('Este pago no tiene contrato asociado; no se puede aplicar a cuotas.');
      this.showApply.set(true);
      return;
    }
    this.applySubmitted.set(false);
    this.applyError.set(null);
    this.initializeApplyFromSchedule();
    this.showApply.set(true);
  }

  cancelApply(): void {
    this.showApply.set(false);
    this.applySubmitted.set(false);
    this.applyError.set(null);
    this.allocationsArray.clear();
  }

  submitApply(): void {
    const current = this.payment();
    if (!current) {
      return;
    }
    this.applySubmitted.set(true);
    this.applyError.set(null);

    const rows = this.allocationsArray.controls.map((group) => group.getRawValue());
    const selectedRows = rows.filter((row) => row.amountApplied !== null && row.amountApplied > 0);

    if (selectedRows.length === 0) {
      this.applyError.set('Debes indicar al menos una cuota con monto aplicado mayor que cero.');
      return;
    }

    const invalidRow = selectedRows.find((row) => row.amountApplied! <= 0 || row.amountApplied! > row.remainingAmount);
    if (invalidRow) {
      this.applyError.set('Hay montos aplicados invalidos. Verifica que sean mayores que cero y no excedan el saldo de cuota.');
      return;
    }

    const payload: ApplyPaymentRequest = {
      allocations: selectedRows.map((row) => ({
        contractInstallmentId: row.contractInstallmentId,
        amountApplied: Number(row.amountApplied)
      }))
    };

    const confirmed = globalThis.confirm(
      `Se aplicaran ${payload.allocations.length} cuotas al pago ${current.paymentNumber}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    this.isSubmitting.set(true);
    this.paymentsApi
      .applyPayment(current.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.feedback.show({ level: 'success', text: 'Pago aplicado correctamente.' });
          this.showApply.set(false);
          this.reload();
        },
        error: (error) => {
          this.isSubmitting.set(false);
          const normalized = this.apiErrorService.normalize(error);
          this.applyError.set(normalized.userMessage);
          this.feedback.showError(
            normalized.status === 409 ? `Conflicto al aplicar pago: ${normalized.userMessage}` : normalized.userMessage
          );
        }
      });
  }

  protected reload(): void {
    this.load();
  }

  onAllocationReceipt(allocation: PaymentAllocationResponse): void {
    if (allocation.hasReceipt && allocation.receiptId) {
      this.downloadReceiptPdf(allocation.receiptId);
      return;
    }
    const payment = this.payment();
    if (!payment) {
      return;
    }
    this.busyAllocationId.set(allocation.id);
    this.paymentsApi
      .emitReceiptForAllocation(payment.id, allocation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.busyAllocationId.set(null);
          this.feedback.showSuccess('Comprobante generado.');
          this.reload();
          this.downloadReceiptPdf(created.id, created.receiptNumber);
        },
        error: (error) => {
          this.busyAllocationId.set(null);
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
        }
      });
  }

  private downloadReceiptPdf(receiptId: string, fallbackNumber = 'recibo'): void {
    this.busyAllocationId.set(receiptId);
    this.receiptsApi
      .downloadReceiptPdf(receiptId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.busyAllocationId.set(null);
          this.saveBlob(response.body, this.readFileName(response) ?? `${fallbackNumber}.pdf`);
        },
        error: (error) => {
          this.busyAllocationId.set(null);
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
        }
      });
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

  private readFileName(response: HttpResponse<Blob>): string | null {
    const disposition = response.headers.get('content-disposition');
    if (!disposition) {
      return null;
    }
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }
    const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
    return asciiMatch?.[1] ?? null;
  }

  private saveBlob(blob: Blob | null, fileName: string): void {
    if (!blob) {
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }

  private initializeApplyFromSchedule(): void {
    this.allocationsArray.clear();
    for (const installment of this.schedule()) {
      this.allocationsArray.push(this.buildAllocationGroup(installment));
    }
  }

  private buildAllocationGroup(installment: ContractInstallmentResponse): AllocationFormGroup {
    return new FormGroup({
      contractInstallmentId: new FormControl<string>(installment.id, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      installmentNumber: new FormControl<number>(installment.installmentNumber, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      dueDate: new FormControl<string>(installment.dueDate, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      remainingAmount: new FormControl<number>(installment.remainingAmount, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      amountApplied: new FormControl<number | null>(null, {
        validators: [Validators.min(0), Validators.max(installment.remainingAmount)]
      })
    });
  }
}
