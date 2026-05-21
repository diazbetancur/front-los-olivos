import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import {
  ApprovePaymentProofRequest,
  ClientLookupItem,
  ContractLookupItem,
  GetPaymentProofsQuery,
  PagedResult,
  PaymentListItemResponse,
  PaymentProofDetailResponse,
  PaymentProofListItemResponse,
  RejectPaymentProofRequest
} from '../models/payments.models';
import { PaymentProofsApiService } from '../services/payment-proofs-api.service';
import { PaymentsApiService } from '../services/payments-api.service';

const LOOKUP_PAGE_SIZE = 100;

@Component({
  selector: 'app-payment-proofs-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective
  ],
  templateUrl: './payment-proofs-page.component.html',
  styleUrl: './payment-proofs-page.component.scss'
})
export class PaymentProofsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly paymentProofsApi = inject(PaymentProofsApiService);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canReview = computed(() => this.authSession.hasPermission('Payments.ReviewProof'));
  readonly isDownloadingProof = signal(false);

  readonly proofStatuses: ReadonlyArray<string> = ['PendienteRevision', 'Aprobado', 'Rechazado'];

  readonly filterForm = this.formBuilder.nonNullable.group({
    contractId: [''],
    clientId: [''],
    paymentId: [''],
    status: [''],
    search: ['', [Validators.maxLength(256)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly approveForm = this.formBuilder.nonNullable.group({
    notes: ['', [Validators.maxLength(1024)]]
  });

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]],
    notes: ['', [Validators.maxLength(1024)]]
  });

  proofs: ReadonlyArray<PaymentProofListItemResponse> = [];
  contractOptions: ReadonlyArray<ContractLookupItem> = [];
  clientOptions: ReadonlyArray<ClientLookupItem> = [];
  paymentOptions: ReadonlyArray<PaymentListItemResponse> = [];
  selectedProofDetail: PaymentProofDetailResponse | null = null;

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isLookupLoading = false;

  showApproveForm = false;
  showRejectForm = false;

  approveSubmitted = false;
  rejectSubmitted = false;

  listError: string | null = null;
  detailError: string | null = null;
  approveError: string | null = null;
  rejectError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  ngOnInit(): void {
    this.loadLookupOptions();
    this.loadProofs(1);
  }

  applyFilters(): void {
    this.loadProofs(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      contractId: '',
      clientId: '',
      paymentId: '',
      status: '',
      search: '',
      pageSize: 20
    });
    this.loadProofs(1);
  }

  goToPreviousPage(): void {
    if (this.currentPage <= 1) {
      return;
    }
    this.loadProofs(this.currentPage - 1);
  }

  goToNextPage(): void {
    if (this.currentPage >= this.totalPages()) {
      return;
    }
    this.loadProofs(this.currentPage + 1);
  }

  viewProofDetail(proofId: string): void {
    this.detailError = null;
    this.selectedProofDetail = null;
    this.showApproveForm = false;
    this.showRejectForm = false;
    this.isDetailLoading = true;

    this.paymentProofsApi
      .getPaymentProofById(proofId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.selectedProofDetail = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  openApproveForm(): void {
    if (!this.selectedProofDetail) {
      return;
    }

    this.showApproveForm = true;
    this.showRejectForm = false;
    this.approveSubmitted = false;
    this.approveError = null;
    this.approveForm.reset({ notes: '' });
  }

  cancelApproveForm(): void {
    this.showApproveForm = false;
    this.approveSubmitted = false;
    this.approveError = null;
  }

  submitApprove(): void {
    if (!this.selectedProofDetail) {
      return;
    }

    this.approveSubmitted = true;
    this.approveError = null;
    if (this.approveForm.invalid) {
      this.approveForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se aprobara el comprobante ${this.selectedProofDetail.externalReference || this.selectedProofDetail.id}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const payload: ApprovePaymentProofRequest = {
      notes: this.cleanString(this.approveForm.controls.notes.value)
    };

    this.isSubmitting = true;
    this.paymentProofsApi
      .approvePaymentProof(this.selectedProofDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Comprobante aprobado correctamente.' });
          this.showApproveForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            proofId: response.id
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.approveError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al aprobar comprobante: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  openRejectForm(): void {
    if (!this.selectedProofDetail) {
      return;
    }

    this.showRejectForm = true;
    this.showApproveForm = false;
    this.rejectSubmitted = false;
    this.rejectError = null;
    this.rejectForm.reset({
      reason: '',
      notes: ''
    });
  }

  cancelRejectForm(): void {
    this.showRejectForm = false;
    this.rejectSubmitted = false;
    this.rejectError = null;
  }

  submitReject(): void {
    if (!this.selectedProofDetail) {
      return;
    }

    this.rejectSubmitted = true;
    this.rejectError = null;
    if (this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se rechazara el comprobante ${this.selectedProofDetail.externalReference || this.selectedProofDetail.id}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const payload: RejectPaymentProofRequest = {
      reason: this.rejectForm.controls.reason.value.trim(),
      notes: this.cleanString(this.rejectForm.controls.notes.value)
    };

    this.isSubmitting = true;
    this.paymentProofsApi
      .rejectPaymentProof(this.selectedProofDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Comprobante rechazado correctamente.' });
          this.showRejectForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            proofId: response.id
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.rejectError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al rechazar comprobante: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  downloadProof(proofId: string): void {
    if (this.isDownloadingProof()) {
      return;
    }
    this.isDownloadingProof.set(true);
    this.paymentProofsApi
      .downloadProofContent(proofId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDownloadingProof.set(false);
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          const blob = response.body;
          if (!blob) {
            this.feedback.showError('No se recibio el archivo del comprobante.');
            return;
          }
          const url = URL.createObjectURL(blob);
          const opened = globalThis.open(url, '_blank', 'noopener,noreferrer');
          if (!opened) {
            this.feedback.showError('El navegador bloqueo la apertura del comprobante. Permite ventanas emergentes.');
          }
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  private reloadAfterMutation(options: { page: number; proofId?: string }): void {
    this.loadProofs(options.page);
    if (options.proofId) {
      this.viewProofDetail(options.proofId);
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Aprobado':
        return 'status-badge approved';
      case 'Rechazado':
        return 'status-badge rejected';
      default:
        return 'status-badge pending';
    }
  }

  resolveContractLabel(contractId: string | null | undefined): string {
    if (!contractId) {
      return '-';
    }
    const item = this.contractOptions.find((contract) => contract.id === contractId);
    return item ? item.contractNumber : contractId;
  }

  resolveClientLabel(clientId: string | null | undefined): string {
    if (!clientId) {
      return '-';
    }
    const item = this.clientOptions.find((client) => client.id === clientId);
    return item ? item.fullName : clientId;
  }

  resolvePaymentLabel(paymentId: string | null | undefined): string {
    if (!paymentId) {
      return '-';
    }
    const item = this.paymentOptions.find((payment) => payment.id === paymentId);
    return item ? item.paymentNumber : paymentId;
  }

  private loadProofs(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetPaymentProofsQuery = {
      contractId: this.cleanString(this.filterForm.controls.contractId.value),
      clientId: this.cleanString(this.filterForm.controls.clientId.value),
      paymentId: this.cleanString(this.filterForm.controls.paymentId.value),
      status: this.cleanString(this.filterForm.controls.status.value),
      search: this.cleanString(this.filterForm.controls.search.value),
      page,
      pageSize: this.filterForm.controls.pageSize.value
    };

    this.paymentProofsApi
      .getPaymentProofs(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<PaymentProofListItemResponse>) => {
          this.proofs = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadLookupOptions(): void {
    this.isLookupLoading = true;

    this.paymentsApi
      .getContractsLookup({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        status: null,
        search: null,
        projectId: null,
        lotId: null,
        clientId: null,
        fromDate: null,
        toDate: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.contractOptions = response.items;
          this.syncView();
        },
        error: () => {
          this.contractOptions = [];
          this.syncView();
        }
      });

    this.paymentsApi
      .getClientsLookup({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        search: null,
        dni: null,
        rtn: null,
        status: null,
        department: null,
        municipality: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.clientOptions = response.items;
          this.syncView();
        },
        error: () => {
          this.clientOptions = [];
          this.syncView();
        }
      });

    this.paymentsApi
      .getPayments({
        contractId: null,
        clientId: null,
        status: null,
        search: null,
        fromDate: null,
        toDate: null,
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLookupLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.paymentOptions = response.items;
        },
        error: () => {
          this.paymentOptions = [];
        }
      });
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
