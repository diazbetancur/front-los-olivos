import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiErrorService } from '../../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../../shared/components/app-modal/app-modal.component';
import { HasPermissionDirective } from '../../../../core/auth/has-permission.directive';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import { ReceiptDetailResponse, ReceiptSignedUploadResponse, VoidReceiptRequest } from '../../models/payments.models';
import { ReceiptsApiService } from '../../services/receipts-api.service';

@Component({
  selector: 'app-receipt-detail-page',
  imports: [CommonModule, ReactiveFormsModule, AppModalComponent, HasPermissionDirective, LoadingStateComponent],
  templateUrl: './receipt-detail-page.component.html',
  styleUrl: './receipt-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  private readonly receiptsApi = inject(ReceiptsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);

  readonly receipt = signal<ReceiptDetailResponse | null>(null);
  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly isSubmitting = signal(false);
  readonly isDownloading = signal(false);
  readonly showVoid = signal(false);
  readonly voidError = signal<string | null>(null);
  readonly voidSubmitted = signal(false);

  readonly signedUploads = signal<ReceiptSignedUploadResponse[]>([]);
  readonly isLoadingUploads = signal(true);
  readonly uploadsError = signal<string | null>(null);
  readonly isUploading = signal(false);
  readonly uploadError = signal<string | null>(null);
  selectedFile: File | null = null;

  readonly voidForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]]
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.isLoading.set(false);
      this.loadError.set('Recibo no encontrado.');
      return;
    }
    this.loadReceipt(id);
    this.loadSignedUploads(id);
  }

  goBack(): void {
    void this.router.navigate(['/admin/receipts']);
  }

  statusClass(status: string): string {
    return status === 'Anulado' ? 'status-badge blocked' : 'status-badge emitted';
  }

  downloadPdf(): void {
    const current = this.receipt();
    if (!current) {
      return;
    }
    this.isDownloading.set(true);
    this.receiptsApi
      .downloadReceiptPdf(current.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDownloading.set(false))
      )
      .subscribe({
        next: (response) => {
          const fileName = this.readFileName(response) ?? `${current.receiptNumber}.pdf`;
          this.saveBlob(response.body, fileName);
          this.feedback.show({ level: 'success', text: `Descarga iniciada: ${fileName}` });
        },
        error: (error) => this.feedback.showError(this.apiErrorService.normalize(error).userMessage)
      });
  }

  onSignedFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile = input.files && input.files.length > 0 ? input.files[0] : null;
    this.uploadError.set(null);
  }

  uploadSignedDocument(): void {
    const current = this.receipt();
    if (!current) {
      return;
    }
    if (!this.selectedFile) {
      this.uploadError.set('Selecciona un archivo para subir.');
      return;
    }
    const file = this.selectedFile;
    this.isUploading.set(true);
    this.uploadError.set(null);
    this.receiptsApi
      .uploadSignedDocument(current.id, file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isUploading.set(false))
      )
      .subscribe({
        next: () => {
          this.selectedFile = null;
          this.feedback.showSuccess('Recibo firmado subido correctamente.');
          this.loadSignedUploads(current.id);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.uploadError.set(normalizedError.userMessage);
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  downloadSignedDocument(uploadId: string): void {
    const current = this.receipt();
    if (!current) {
      return;
    }
    this.isDownloading.set(true);
    this.receiptsApi
      .downloadSignedDocument(current.id, uploadId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDownloading.set(false))
      )
      .subscribe({
        next: (response) => {
          const fileName = this.readFileName(response) ?? `${current.receiptNumber}-firmado.pdf`;
          this.saveBlob(response.body, fileName);
          this.feedback.show({ level: 'success', text: `Descarga iniciada: ${fileName}` });
        },
        error: (error) => this.feedback.showError(this.apiErrorService.normalize(error).userMessage)
      });
  }

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
    const current = this.receipt();
    this.voidSubmitted.set(true);
    this.voidError.set(null);
    if (!current || this.voidForm.invalid) {
      this.voidForm.markAllAsTouched();
      return;
    }

    const payload: VoidReceiptRequest = { reason: this.voidForm.getRawValue().reason.trim() };
    this.isSubmitting.set(true);
    this.receiptsApi
      .voidReceipt(current.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false))
      )
      .subscribe({
        next: (response) => {
          this.receipt.set(response);
          this.showVoid.set(false);
          this.feedback.show({ level: 'success', text: 'Recibo anulado correctamente.' });
        },
        error: (error) => this.voidError.set(this.apiErrorService.normalize(error).userMessage)
      });
  }

  private loadReceipt(id: string): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.receiptsApi
      .getReceiptById(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false))
      )
      .subscribe({
        next: (response) => this.receipt.set(response),
        error: (error) => this.loadError.set(this.apiErrorService.normalize(error).userMessage)
      });
  }

  private loadSignedUploads(receiptId: string): void {
    this.isLoadingUploads.set(true);
    this.uploadsError.set(null);
    this.receiptsApi
      .getSignedDocuments(receiptId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoadingUploads.set(false))
      )
      .subscribe({
        next: (response) => this.signedUploads.set(response),
        error: (error) => this.uploadsError.set(this.apiErrorService.normalize(error).userMessage)
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
}
