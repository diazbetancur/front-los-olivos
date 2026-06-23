import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  ApplyPaymentRequest,
  ApprovePaymentRequest,
  ClientLookupItem,
  ContractBalanceResponse,
  ContractInstallmentResponse,
  ContractLookupItem,
  GetPaymentsQuery,
  PagedResult,
  PaymentApplyResultResponse,
  PaymentDetailResponse,
  PaymentListItemResponse,
  ReceiptDetailResponse,
  RegisterPaymentRequest,
  RejectPaymentRequest,
  VoidPaymentRequest
} from '../models/payments.models';

interface GetContractsLookupQuery {
  page: number;
  pageSize: number;
  status?: string | null;
  search?: string | null;
  projectId?: string | null;
  lotId?: string | null;
  clientId?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

interface GetClientsLookupQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  dni?: string | null;
  rtn?: string | null;
  status?: string | null;
  department?: string | null;
  municipality?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentsApiService {
  constructor(
    private readonly apiClient: ApiClientService,
    private readonly httpClient: HttpClient
  ) {}

  getPayments(query: GetPaymentsQuery): Observable<PagedResult<PaymentListItemResponse>> {
    return this.apiClient.get<PagedResult<PaymentListItemResponse>>('/api/v1/admin/payments', {
      params: this.toParams(query)
    });
  }

  registerPayment(request: RegisterPaymentRequest): Observable<PaymentApplyResultResponse> {
    return this.apiClient.post<RegisterPaymentRequest, PaymentApplyResultResponse>('/api/v1/admin/payments', request);
  }

  // POST /api/v1/admin/payments/transfer (multipart)
  registerTransferPayment(form: FormData): Observable<PaymentDetailResponse> {
    return this.httpClient.post<PaymentDetailResponse>('/api/v1/admin/payments/transfer', form);
  }

  getPaymentById(paymentId: string): Observable<PaymentDetailResponse> {
    return this.apiClient.get<PaymentDetailResponse>(`/api/v1/admin/payments/${paymentId}`);
  }

  applyPayment(paymentId: string, request: ApplyPaymentRequest): Observable<PaymentDetailResponse> {
    return this.apiClient.post<ApplyPaymentRequest, PaymentDetailResponse>(`/api/v1/admin/payments/${paymentId}/apply`, request);
  }

  voidPayment(paymentId: string, request: VoidPaymentRequest): Observable<PaymentDetailResponse> {
    return this.apiClient.post<VoidPaymentRequest, PaymentDetailResponse>(`/api/v1/admin/payments/${paymentId}/void`, request);
  }

  // POST /api/v1/admin/payments/{paymentId}/approve
  approvePayment(paymentId: string, request: ApprovePaymentRequest): Observable<PaymentApplyResultResponse> {
    return this.apiClient.post<ApprovePaymentRequest, PaymentApplyResultResponse>(
      `/api/v1/admin/payments/${paymentId}/approve`,
      request
    );
  }

  // POST /api/v1/admin/payments/{paymentId}/reject
  rejectPayment(paymentId: string, request: RejectPaymentRequest): Observable<PaymentDetailResponse> {
    return this.apiClient.post<RejectPaymentRequest, PaymentDetailResponse>(
      `/api/v1/admin/payments/${paymentId}/reject`,
      request
    );
  }

  downloadProofContent(proofId: string): Observable<HttpResponse<Blob>> {
    return this.httpClient.get(`/api/v1/payment-proofs/${proofId}/content`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  emitReceiptForAllocation(paymentId: string, allocationId: string): Observable<ReceiptDetailResponse> {
    return this.apiClient.post<Record<string, never>, ReceiptDetailResponse>(
      `/api/v1/admin/payments/${paymentId}/allocations/${allocationId}/receipt`,
      {}
    );
  }

  getContractBalance(contractId: string): Observable<ContractBalanceResponse> {
    return this.apiClient.get<ContractBalanceResponse>(`/api/v1/admin/contracts/${contractId}/balance`);
  }

  getContractPayments(contractId: string): Observable<ReadonlyArray<PaymentListItemResponse>> {
    return this.apiClient.get<ReadonlyArray<PaymentListItemResponse>>(`/api/v1/admin/contracts/${contractId}/payments`);
  }

  getContractSchedule(contractId: string): Observable<ReadonlyArray<ContractInstallmentResponse>> {
    return this.apiClient.get<ReadonlyArray<ContractInstallmentResponse>>(`/api/v1/admin/contracts/${contractId}/schedule`);
  }

  getContractsLookup(query: GetContractsLookupQuery): Observable<PagedResult<ContractLookupItem>> {
    return this.apiClient.get<PagedResult<ContractLookupItem>>('/api/v1/admin/contracts', {
      params: this.toParams(query)
    });
  }

  getClientsLookup(query: GetClientsLookupQuery): Observable<PagedResult<ClientLookupItem>> {
    return this.apiClient.get<PagedResult<ClientLookupItem>>('/api/v1/admin/clients', {
      params: this.toParams(query)
    });
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
