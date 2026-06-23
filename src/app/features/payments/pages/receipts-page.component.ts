import { CommonModule } from '@angular/common';
import { HttpResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
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
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import {
  ClientLookupItem,
  ContractLookupItem,
  GetReceiptsQuery,
  PagedResult,
  PaymentListItemResponse,
  ReceiptDetailResponse,
  ReceiptListItemResponse,
  VoidReceiptRequest
} from '../models/payments.models';
import { PaymentsApiService } from '../services/payments-api.service';
import { ReceiptsApiService } from '../services/receipts-api.service';

const LOOKUP_PAGE_SIZE = 100;

@Component({
  selector: 'app-receipts-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent
  ],
  templateUrl: './receipts-page.component.html',
  styleUrl: './receipts-page.component.scss'
})
export class ReceiptsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly receiptsApi = inject(ReceiptsApiService);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canPrint = computed(() => this.authSession.hasPermission('Receipts.Print'));
  readonly canVoid = computed(() => this.authSession.hasPermission('Receipts.Void'));

  readonly receiptStatuses: ReadonlyArray<string> = ['Emitido', 'Anulado'];

  readonly filterForm = this.formBuilder.nonNullable.group({
    contractId: [''],
    clientId: [''],
    paymentId: [''],
    status: [''],
    search: ['', [Validators.maxLength(256)]],
    fromDate: [''],
    toDate: [''],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly voidForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]]
  });

  receipts: ReadonlyArray<ReceiptListItemResponse> = [];
  contractOptions: ReadonlyArray<ContractLookupItem> = [];
  clientOptions: ReadonlyArray<ClientLookupItem> = [];
  paymentOptions: ReadonlyArray<PaymentListItemResponse> = [];
  selectedReceiptDetail: ReceiptDetailResponse | null = null;

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isDownloading = false;
  isLookupLoading = false;

  showVoidForm = false;

  voidSubmitted = false;

  listError: string | null = null;
  detailError: string | null = null;
  voidError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  ngOnInit(): void {
    this.loadLookupOptions();
    this.loadReceipts(1);
  }

  applyFilters(): void {
    this.loadReceipts(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      contractId: '',
      clientId: '',
      paymentId: '',
      status: '',
      search: '',
      fromDate: '',
      toDate: '',
      pageSize: 20
    });
    this.loadReceipts(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadReceipts(1);
  }

  viewReceiptDetail(receiptId: string): void {
    this.detailError = null;
    this.selectedReceiptDetail = null;
    this.showVoidForm = false;
    this.isDetailLoading = true;

    this.receiptsApi
      .getReceiptById(receiptId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.selectedReceiptDetail = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  downloadPdf(receiptId: string, receiptNumber: string): void {
    this.downloadFile(
      this.receiptsApi.downloadReceiptPdf(receiptId),
      `${receiptNumber}.pdf`
    );
  }

  downloadDocx(receiptId: string, receiptNumber: string): void {
    this.downloadFile(
      this.receiptsApi.downloadReceiptDocx(receiptId),
      `${receiptNumber}.docx`
    );
  }

  openVoidForm(): void {
    if (!this.selectedReceiptDetail) {
      return;
    }

    this.showVoidForm = true;
    this.voidSubmitted = false;
    this.voidError = null;
    this.voidForm.reset({ reason: '' });
  }

  cancelVoidForm(): void {
    this.showVoidForm = false;
    this.voidSubmitted = false;
    this.voidError = null;
  }

  submitVoidReceipt(): void {
    if (!this.selectedReceiptDetail) {
      return;
    }

    this.voidSubmitted = true;
    this.voidError = null;
    if (this.voidForm.invalid) {
      this.voidForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se anulara el recibo ${this.selectedReceiptDetail.receiptNumber}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const payload: VoidReceiptRequest = {
      reason: this.cleanString(this.voidForm.controls.reason.value)
    };

    this.isSubmitting = true;
    this.receiptsApi
      .voidReceipt(this.selectedReceiptDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Recibo anulado correctamente.' });
          this.showVoidForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            receiptId: response.id
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.voidError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al anular recibo: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  private reloadAfterMutation(options: { page: number; receiptId?: string; refreshLookups?: boolean }): void {
    if (options.refreshLookups) {
      this.loadLookupOptions();
    }

    this.loadReceipts(options.page);
    if (options.receiptId) {
      this.viewReceiptDetail(options.receiptId);
    }
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Anulado':
        return 'status-badge blocked';
      default:
        return 'status-badge emitted';
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

  protected loadReceipts(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetReceiptsQuery = {
      contractId: this.cleanString(this.filterForm.controls.contractId.value),
      clientId: this.cleanString(this.filterForm.controls.clientId.value),
      paymentId: this.cleanString(this.filterForm.controls.paymentId.value),
      status: this.cleanString(this.filterForm.controls.status.value),
      search: this.cleanString(this.filterForm.controls.search.value),
      fromDate: this.cleanString(this.filterForm.controls.fromDate.value),
      toDate: this.cleanString(this.filterForm.controls.toDate.value),
      page,
      pageSize: this.filterForm.controls.pageSize.value
    };

    this.receiptsApi
      .getReceipts(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<ReceiptListItemResponse>) => {
          this.receipts = response.items;
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

  private downloadFile(download$: ReturnType<ReceiptsApiService['downloadReceiptPdf']>, fallbackName: string): void {
    this.isDownloading = true;
    download$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDownloading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          const fileName = this.readFileName(response) ?? fallbackName;
          this.saveBlob(response.body, fileName);
          this.feedback.show({ level: 'success', text: `Descarga iniciada: ${fileName}` });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.feedback.showError(normalizedError.userMessage);
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

    const asciiMatch = disposition.match(/filename="?([^\";]+)"?/i);
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
