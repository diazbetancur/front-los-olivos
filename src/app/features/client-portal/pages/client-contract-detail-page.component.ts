import { CommonModule } from '@angular/common';
import { HttpResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import {
  ClientAllocationItem,
  ClientContractDetail,
  ClientPaymentListItem,
  ClientPaymentProofDetail,
  ContractInstallmentItem
} from '../models/client-portal.models';
import { ClientPortalApiService } from '../services/client-portal-api.service';

type ClientContractSection = 'overview' | 'schedule' | 'payments' | 'receipts';

@Component({
  selector: 'app-client-contract-detail-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingStateComponent, EmptyStateComponent, AppModalComponent],
  templateUrl: './client-contract-detail-page.component.html',
  styleUrl: './client-contract-detail-page.component.scss'
})
export class ClientContractDetailPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly api = inject(ClientPortalApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);

  readonly proofForm = this.formBuilder.nonNullable.group({
    paymentDate: [this.todayString(), [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['HNL', [Validators.maxLength(16)]],
    externalReference: ['', [Validators.maxLength(256)]],
    notes: ['', [Validators.maxLength(2048)]],
    fileName: ['', [Validators.required]]
  });

  contractId: string | null = null;
  activeSection: ClientContractSection = 'overview';

  contract: ClientContractDetail | null = null;
  schedule: ReadonlyArray<ContractInstallmentItem> = [];
  payments: ReadonlyArray<ClientPaymentListItem> = [];
  allocations: ReadonlyArray<ClientAllocationItem> = [];

  isContractLoading = false;
  isScheduleLoading = false;
  isPaymentsLoading = false;
  isReceiptsLoading = false;
  isSubmittingProof = false;

  contractError: string | null = null;
  scheduleError: string | null = null;
  paymentsError: string | null = null;
  receiptsError: string | null = null;
  proofError: string | null = null;

  proofSubmitted = false;
  private selectedFile: File | null = null;

  showProofModal = false;

  readonly schedulePageSizeOptions = [10, 25, 50];
  schedulePageSize = 10;
  schedulePage = 1;

  readonly allocationsPageSizeOptions = [10, 25, 50];
  allocationsPageSize = 10;
  allocationsPage = 1;
  busyAllocationId: string | null = null;

  ngOnInit(): void {
    this.route.data.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((data) => {
      this.activeSection = this.resolveSection(data['section']);
      this.syncView();
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const contractId = params.get('id');
      if (!contractId || contractId === this.contractId) {
        return;
      }

      this.contractId = contractId;
      this.loadContractBundle(contractId);
      this.resetProofForm();
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.selectedFile = file;
    this.proofForm.controls.fileName.setValue(file?.name ?? '');
    this.proofForm.controls.fileName.markAsTouched();
  }

  openProofModal(): void {
    this.resetProofForm();
    this.showProofModal = true;
  }

  closeProofModal(): void {
    this.showProofModal = false;
  }

  get pagedSchedule(): ReadonlyArray<ContractInstallmentItem> {
    const start = (this.schedulePage - 1) * this.schedulePageSize;
    return this.schedule.slice(start, start + this.schedulePageSize);
  }

  get scheduleTotalPages(): number {
    return Math.max(1, Math.ceil(this.schedule.length / this.schedulePageSize));
  }

  onSchedulePageSizeChange(event: Event): void {
    this.schedulePageSize = Number((event.target as HTMLSelectElement).value);
    this.schedulePage = 1;
  }

  prevSchedulePage(): void {
    if (this.schedulePage > 1) {
      this.schedulePage -= 1;
    }
  }

  nextSchedulePage(): void {
    if (this.schedulePage < this.scheduleTotalPages) {
      this.schedulePage += 1;
    }
  }

  get pagedAllocations(): ReadonlyArray<ClientAllocationItem> {
    const start = (this.allocationsPage - 1) * this.allocationsPageSize;
    return this.allocations.slice(start, start + this.allocationsPageSize);
  }

  get allocationsTotalPages(): number {
    return Math.max(1, Math.ceil(this.allocations.length / this.allocationsPageSize));
  }

  onAllocationsPageSizeChange(event: Event): void {
    this.allocationsPageSize = Number((event.target as HTMLSelectElement).value);
    this.allocationsPage = 1;
  }

  prevAllocationsPage(): void {
    if (this.allocationsPage > 1) { this.allocationsPage -= 1; }
  }

  nextAllocationsPage(): void {
    if (this.allocationsPage < this.allocationsTotalPages) { this.allocationsPage += 1; }
  }

  onAllocationReceipt(allocation: ClientAllocationItem): void {
    if (!this.contractId || this.busyAllocationId !== null) {
      return;
    }
    if (allocation.hasReceipt && allocation.receiptId) {
      this.downloadAllocationReceipt(allocation.receiptId);
      return;
    }
    this.busyAllocationId = allocation.id;
    this.syncView();
    this.api
      .generateAllocationReceipt(this.contractId, allocation.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.busyAllocationId = null;
          this.downloadAllocationReceipt(created.id);
          if (this.contractId) {
            this.loadAllocations(this.contractId);
          }
        },
        error: (error) => {
          this.busyAllocationId = null;
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
          this.syncView();
        }
      });
  }

  private downloadAllocationReceipt(receiptId: string): void {
    if (!this.contractId) {
      return;
    }
    this.busyAllocationId = receiptId;
    this.api
      .downloadReceiptPdf(this.contractId, receiptId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.busyAllocationId = null;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          const fileName = this.readFileName(response) ?? `${receiptId}.pdf`;
          this.saveBlob(response.body, fileName);
          this.feedback.showSuccess('Comprobante descargado.');
        },
        error: (error) => {
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
        }
      });
  }

  submitPaymentProof(): void {
    this.proofSubmitted = true;
    this.proofError = null;

    if (!this.contractId) {
      this.proofError = 'No se encontro contrato seleccionado.';
      return;
    }

    if (this.proofForm.invalid || !this.selectedFile) {
      this.proofForm.markAllAsTouched();
      if (!this.selectedFile) {
        this.proofError = 'Debes seleccionar un archivo.';
      }
      return;
    }

    const raw = this.proofForm.getRawValue();
    this.isSubmittingProof = true;

    this.api
      .uploadPaymentProof(this.contractId, {
        paymentDate: raw.paymentDate,
        amount: Number(raw.amount),
        currency: this.cleanString(raw.currency) ?? 'HNL',
        externalReference: this.cleanString(raw.externalReference),
        notes: this.cleanString(raw.notes),
        file: this.selectedFile
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmittingProof = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          this.showProofModal = false;
          this.feedback.showSuccess('Pago registrado por transferencia. Queda pendiente de aprobacion.');
          if (this.contractId) {
            this.loadPayments(this.contractId);
          }
          this.resetProofForm();
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.proofError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  contractStatusClass(status: string): string {
    switch (status) {
      case 'Activo':
      case 'Pagado':
      case 'Cerrado':
        return 'status-badge ok';
      case 'EnMora':
      case 'Rescindido':
      case 'Anulado':
        return 'status-badge danger';
      case 'PendienteFirma':
      case 'Borrador':
        return 'status-badge warn';
      default:
        return 'status-badge';
    }
  }

  installmentStatusClass(status: string): string {
    switch (status) {
      case 'Pagada':
      case 'Paid':
        return 'status-badge ok';
      case 'Parcial':
      case 'Partial':
        return 'status-badge warn';
      case 'Vencida':
      case 'Overdue':
      case 'Cancelled':
      case 'Anulada':
        return 'status-badge danger';
      default:
        return 'status-badge';
    }
  }

  paymentStatusClass(status: string): string {
    switch (status) {
      case 'Aplicado':
      case 'Registrado':
        return 'status-badge ok';
      case 'PendienteRevision':
        return 'status-badge warn';
      case 'Rechazado':
      case 'Anulado':
        return 'status-badge danger';
      default:
        return 'status-badge';
    }
  }

  private loadContractBundle(contractId: string): void {
    this.loadContract(contractId);
    this.loadSchedule(contractId);
    this.loadPayments(contractId);
    this.loadAllocations(contractId);
  }

  private loadContract(contractId: string): void {
    this.isContractLoading = true;
    this.contractError = null;
    this.contract = null;

    this.api
      .getContractById(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isContractLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.contract = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.contractError = normalizedError.userMessage;
        }
      });
  }

  private loadSchedule(contractId: string): void {
    this.isScheduleLoading = true;
    this.scheduleError = null;
    this.schedule = [];

    this.api
      .getSchedule(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isScheduleLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.schedule = response;
          this.schedulePage = 1;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.scheduleError = normalizedError.userMessage;
        }
      });
  }

  private loadPayments(contractId: string): void {
    this.isPaymentsLoading = true;
    this.paymentsError = null;
    this.payments = [];

    this.api
      .getPayments(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isPaymentsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.payments = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.paymentsError = normalizedError.userMessage;
        }
      });
  }

  private loadAllocations(contractId: string): void {
    this.isReceiptsLoading = true;
    this.receiptsError = null;
    this.allocations = [];

    this.api
      .getAllocations(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isReceiptsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.allocations = response;
          this.allocationsPage = 1;
        },
        error: (error) => {
          this.receiptsError = this.apiErrorService.normalize(error).userMessage;
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

  private resolveSection(value: unknown): ClientContractSection {
    if (value === 'schedule' || value === 'payments' || value === 'receipts' || value === 'overview') {
      return value;
    }
    return 'overview';
  }

  private resetProofForm(): void {
    this.proofSubmitted = false;
    this.proofError = null;
    this.selectedFile = null;
    this.proofForm.reset({
      paymentDate: this.todayString(),
      amount: 0,
      currency: 'HNL',
      externalReference: '',
      notes: '',
      fileName: ''
    });
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
