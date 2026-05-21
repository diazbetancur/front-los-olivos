import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  ApprovePaymentProofRequest,
  GetPaymentProofsQuery,
  PagedResult,
  PaymentProofDetailResponse,
  PaymentProofListItemResponse,
  RejectPaymentProofRequest
} from '../models/payments.models';

@Injectable({ providedIn: 'root' })
export class PaymentProofsApiService {
  constructor(
    private readonly apiClient: ApiClientService,
    private readonly httpClient: HttpClient
  ) {}

  downloadProofContent(proofId: string): Observable<HttpResponse<Blob>> {
    return this.httpClient.get(`/api/v1/payment-proofs/${proofId}/content`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  getPaymentProofs(query: GetPaymentProofsQuery): Observable<PagedResult<PaymentProofListItemResponse>> {
    return this.apiClient.get<PagedResult<PaymentProofListItemResponse>>('/api/v1/admin/payment-proofs', {
      params: this.toParams(query)
    });
  }

  getPaymentProofById(proofId: string): Observable<PaymentProofDetailResponse> {
    return this.apiClient.get<PaymentProofDetailResponse>(`/api/v1/admin/payment-proofs/${proofId}`);
  }

  approvePaymentProof(proofId: string, request: ApprovePaymentProofRequest): Observable<PaymentProofDetailResponse> {
    return this.apiClient.post<ApprovePaymentProofRequest, PaymentProofDetailResponse>(
      `/api/v1/admin/payment-proofs/${proofId}/approve`,
      request
    );
  }

  rejectPaymentProof(proofId: string, request: RejectPaymentProofRequest): Observable<PaymentProofDetailResponse> {
    return this.apiClient.post<RejectPaymentProofRequest, PaymentProofDetailResponse>(
      `/api/v1/admin/payment-proofs/${proofId}/reject`,
      request
    );
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
