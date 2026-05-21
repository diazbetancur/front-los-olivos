import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  ApplyPaymentRequest,
  ClientLookupItem,
  ContractBalanceResponse,
  ContractInstallmentResponse,
  ContractLookupItem,
  GetPaymentsQuery,
  PagedResult,
  PaymentDetailResponse,
  PaymentListItemResponse,
  RegisterPaymentRequest,
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
  constructor(private readonly apiClient: ApiClientService) {}

  getPayments(query: GetPaymentsQuery): Observable<PagedResult<PaymentListItemResponse>> {
    return this.apiClient.get<PagedResult<PaymentListItemResponse>>('/api/v1/admin/payments', {
      params: this.toParams(query)
    });
  }

  registerPayment(request: RegisterPaymentRequest): Observable<PaymentDetailResponse> {
    return this.apiClient.post<RegisterPaymentRequest, PaymentDetailResponse>('/api/v1/admin/payments', request);
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
