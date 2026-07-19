import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { ReceiptSignedUploadResponse } from '../../models/payments.models';
import { ReceiptsApiService } from '../../services/receipts-api.service';
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

  it('starts with an empty signed-document history', () => {
    expect(component.signedUploads()).toEqual([]);
  });

  it('requires a selected file before uploading a signed document', () => {
    const receiptsApi = TestBed.inject(ReceiptsApiService);
    const uploadSpy = vi.spyOn(receiptsApi, 'uploadSignedDocument');
    component.receipt.set({
      id: 'r1', receiptNumber: 'REC-1', paymentId: null, contractId: null, clientId: null,
      receiptDate: '2026-06-01', amount: 100, currency: 'HNL', status: 'Emitido', notes: '',
      generatedAtUtc: '2026-06-01T12:00:00Z', generatedBy: 'tester', voidReason: ''
    });
    component.selectedFile = null;

    component.uploadSignedDocument();

    expect(uploadSpy).not.toHaveBeenCalled();
    expect(component.uploadError()).toBeTruthy();
  });

  it('uploads the selected file and refreshes the history on success', () => {
    const receiptsApi = TestBed.inject(ReceiptsApiService);
    const feedback = TestBed.inject(AppFeedbackService);
    const upload: ReceiptSignedUploadResponse = {
      id: 'u1', receiptId: 'r1', fileName: 'firmado.pdf', contentType: 'application/pdf',
      sizeBytes: 1024, uploadedAtUtc: '2026-07-01T00:00:00Z', uploadedBy: 'admin'
    };
    const file = new File(['content'], 'firmado.pdf', { type: 'application/pdf' });
    const uploadSpy = vi.spyOn(receiptsApi, 'uploadSignedDocument').mockReturnValue(of(upload));
    const historySpy = vi.spyOn(receiptsApi, 'getSignedDocuments').mockReturnValue(of([upload]));
    const successSpy = vi.spyOn(feedback, 'showSuccess');

    component.receipt.set({
      id: 'r1', receiptNumber: 'REC-1', paymentId: null, contractId: null, clientId: null,
      receiptDate: '2026-06-01', amount: 100, currency: 'HNL', status: 'Emitido', notes: '',
      generatedAtUtc: '2026-06-01T12:00:00Z', generatedBy: 'tester', voidReason: ''
    });
    component.onSignedFileSelected({ target: { files: [file] } } as unknown as Event);

    component.uploadSignedDocument();

    expect(uploadSpy).toHaveBeenCalledWith('r1', file);
    expect(historySpy).toHaveBeenCalledWith('r1');
    expect(component.signedUploads()).toEqual([upload]);
    expect(component.selectedFile).toBeNull();
    expect(successSpy).toHaveBeenCalled();
  });

  it('surfaces a normalized error message when the upload fails', () => {
    const receiptsApi = TestBed.inject(ReceiptsApiService);
    vi.spyOn(receiptsApi, 'uploadSignedDocument').mockReturnValue(throwError(() => new Error('boom')));
    component.receipt.set({
      id: 'r1', receiptNumber: 'REC-1', paymentId: null, contractId: null, clientId: null,
      receiptDate: '2026-06-01', amount: 100, currency: 'HNL', status: 'Emitido', notes: '',
      generatedAtUtc: '2026-06-01T12:00:00Z', generatedBy: 'tester', voidReason: ''
    });
    component.selectedFile = new File(['content'], 'firmado.pdf', { type: 'application/pdf' });

    component.uploadSignedDocument();

    expect(component.uploadError()).toBeTruthy();
    expect(component.isUploading()).toBe(false);
  });

  it('downloads a signed document from the history using the receipts service', () => {
    const receiptsApi = TestBed.inject(ReceiptsApiService);
    const downloadSpy = vi.spyOn(receiptsApi, 'downloadSignedDocument').mockReturnValue(
      of(new HttpResponse({ body: new Blob(['x']), status: 200 }))
    );
    component.receipt.set({
      id: 'r1', receiptNumber: 'REC-1', paymentId: null, contractId: null, clientId: null,
      receiptDate: '2026-06-01', amount: 100, currency: 'HNL', status: 'Emitido', notes: '',
      generatedAtUtc: '2026-06-01T12:00:00Z', generatedBy: 'tester', voidReason: ''
    });

    component.downloadSignedDocument('u1');

    expect(downloadSpy).toHaveBeenCalledWith('r1', 'u1');
    expect(component.isDownloading()).toBe(false);
  });
});
