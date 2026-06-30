import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';

export const PAYMENT_PROOF_MAX_BYTES = 10 * 1024 * 1024;
export const PAYMENT_PROOF_ALLOWED_TYPES: ReadonlyArray<string> = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png'
];

export class PaymentProofUploadError extends Error {
  constructor(message: string, readonly reason: 'size' | 'type' | 'missing') {
    super(message);
    this.name = 'PaymentProofUploadError';
  }
}
import {
  ClientAllocationItem,
  ClientContractDetail,
  ClientContractListItem,
  ClientPaymentListItem,
  ClientPaymentProofDetail,
  ContractInstallmentItem,
  GetClientContractsQuery,
  PagedResult,
  UploadClientPaymentProofRequest
} from '../models/client-portal.models';

@Injectable({ providedIn: 'root' })
export class ClientPortalApiService {
  constructor(
    private readonly apiClient: ApiClientService,
    private readonly httpClient: HttpClient
  ) {}

  getContracts(query: GetClientContractsQuery): Observable<PagedResult<ClientContractListItem>> {
    return this.apiClient.get<PagedResult<ClientContractListItem>>('/api/v1/client/contracts', {
      params: this.toParams(query)
    });
  }

  getContractById(contractId: string): Observable<ClientContractDetail> {
    return this.apiClient.get<ClientContractDetail>(`/api/v1/client/contracts/${contractId}`);
  }

  getSchedule(contractId: string): Observable<ReadonlyArray<ContractInstallmentItem>> {
    return this.apiClient.get<ReadonlyArray<ContractInstallmentItem>>(`/api/v1/client/contracts/${contractId}/schedule`);
  }

  getPayments(contractId: string): Observable<ReadonlyArray<ClientPaymentListItem>> {
    return this.apiClient.get<ReadonlyArray<ClientPaymentListItem>>(`/api/v1/client/contracts/${contractId}/payments`);
  }

  getAllocations(contractId: string): Observable<ReadonlyArray<ClientAllocationItem>> {
    return this.apiClient.get<ReadonlyArray<ClientAllocationItem>>(`/api/v1/client/contracts/${contractId}/allocations`);
  }

  generateAllocationReceipt(contractId: string, allocationId: string): Observable<{ id: string }> {
    return this.apiClient.post<Record<string, never>, { id: string }>(
      `/api/v1/client/contracts/${contractId}/allocations/${allocationId}/receipt`,
      {}
    );
  }

  uploadPaymentProof(contractId: string, request: UploadClientPaymentProofRequest): Observable<ClientPaymentProofDetail> {
    if (!request.file) {
      return throwError(() => new PaymentProofUploadError('Selecciona un archivo de comprobante.', 'missing'));
    }
    if (request.file.size > PAYMENT_PROOF_MAX_BYTES) {
      return throwError(
        () =>
          new PaymentProofUploadError(
            `El archivo supera el tamano maximo de ${PAYMENT_PROOF_MAX_BYTES / (1024 * 1024)} MB.`,
            'size'
          )
      );
    }
    if (request.file.type && !PAYMENT_PROOF_ALLOWED_TYPES.includes(request.file.type.toLowerCase())) {
      return throwError(
        () => new PaymentProofUploadError('Tipo de archivo no permitido. Usa PDF, JPG o PNG.', 'type')
      );
    }

    const formData = new FormData();
    formData.append('paymentDate', request.paymentDate);
    formData.append('amount', String(request.amount));
    if (request.currency) {
      formData.append('currency', request.currency);
    }
    if (request.externalReference) {
      formData.append('externalReference', request.externalReference);
    }
    if (request.notes) {
      formData.append('notes', request.notes);
    }
    formData.append('file', request.file);

    return this.httpClient.post<ClientPaymentProofDetail>(`/api/v1/client/contracts/${contractId}/payment-proofs`, formData);
  }

  downloadReceiptPdf(contractId: string, receiptId: string): Observable<HttpResponse<Blob>> {
    return this.httpClient.get(`/api/v1/client/contracts/${contractId}/receipts/${receiptId}/pdf`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
