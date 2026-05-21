import { CommonModule } from '@angular/common';
import { HttpResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import {
  ClientContractDetail,
  ClientPaymentListItem,
  ClientPaymentProofDetail,
  ClientReceiptListItem,
  ContractInstallmentItem
} from '../models/client-portal.models';
import { ClientPortalApiService } from '../services/client-portal-api.service';

type ClientContractSection = 'overview' | 'schedule' | 'payments' | 'receipts';

@Component({
  selector: 'app-client-contract-detail-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingStateComponent, EmptyStateComponent],
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
  receipts: ReadonlyArray<ClientReceiptListItem> = [];

  isContractLoading = false;
  isScheduleLoading = false;
  isPaymentsLoading = false;
  isReceiptsLoading = false;
  isSubmittingProof = false;
  isDownloading = false;

  contractError: string | null = null;
  scheduleError: string | null = null;
  paymentsError: string | null = null;
  receiptsError: string | null = null;
  proofError: string | null = null;

  proofSubmitted = false;
  private selectedFile: File | null = null;

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
          this.feedback.showSuccess('Comprobante enviado. Estado: PendienteRevision.');
          this.resetProofForm();
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.proofError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  downloadReceiptPdf(receipt: ClientReceiptListItem): void {
    if (!this.contractId) {
      return;
    }
    this.downloadFile(
      this.api.downloadReceiptPdf(this.contractId, receipt.id),
      `${receipt.receiptNumber}.pdf`
    );
  }

  downloadReceiptDocx(receipt: ClientReceiptListItem): void {
    if (!this.contractId) {
      return;
    }
    this.downloadFile(
      this.api.downloadReceiptDocx(this.contractId, receipt.id),
      `${receipt.receiptNumber}.docx`
    );
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

  receiptStatusClass(status: string): string {
    return status === 'Anulado' ? 'status-badge danger' : 'status-badge ok';
  }

  private loadContractBundle(contractId: string): void {
    this.loadContract(contractId);
    this.loadSchedule(contractId);
    this.loadPayments(contractId);
    this.loadReceipts(contractId);
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

  private loadReceipts(contractId: string): void {
    this.isReceiptsLoading = true;
    this.receiptsError = null;
    this.receipts = [];

    this.api
      .getReceipts(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isReceiptsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.receipts = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.receiptsError = normalizedError.userMessage;
        }
      });
  }

  private downloadFile(download$: ReturnType<ClientPortalApiService['downloadReceiptPdf']>, fallbackName: string): void {
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
          this.feedback.showSuccess(`Descarga iniciada: ${fileName}`);
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
