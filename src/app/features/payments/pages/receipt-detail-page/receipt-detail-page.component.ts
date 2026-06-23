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
import { ReceiptDetailResponse, VoidReceiptRequest } from '../../models/payments.models';
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
