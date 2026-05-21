import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  CreateManualReceiptRequest,
  GetReceiptsQuery,
  PagedResult,
  ReceiptDetailResponse,
  ReceiptListItemResponse,
  VoidReceiptRequest
} from '../models/payments.models';

@Injectable({ providedIn: 'root' })
export class ReceiptsApiService {
  constructor(
    private readonly apiClient: ApiClientService,
    private readonly httpClient: HttpClient
  ) {}

  getReceipts(query: GetReceiptsQuery): Observable<PagedResult<ReceiptListItemResponse>> {
    return this.apiClient.get<PagedResult<ReceiptListItemResponse>>('/api/v1/admin/receipts', {
      params: this.toParams(query)
    });
  }

  createManualReceipt(request: CreateManualReceiptRequest): Observable<ReceiptDetailResponse> {
    return this.apiClient.post<CreateManualReceiptRequest, ReceiptDetailResponse>('/api/v1/admin/receipts/manual', request);
  }

  getReceiptById(receiptId: string): Observable<ReceiptDetailResponse> {
    return this.apiClient.get<ReceiptDetailResponse>(`/api/v1/admin/receipts/${receiptId}`);
  }

  voidReceipt(receiptId: string, request: VoidReceiptRequest): Observable<ReceiptDetailResponse> {
    return this.apiClient.post<VoidReceiptRequest, ReceiptDetailResponse>(`/api/v1/admin/receipts/${receiptId}/void`, request);
  }

  downloadReceiptPdf(receiptId: string): Observable<HttpResponse<Blob>> {
    return this.httpClient.get(`/api/v1/admin/receipts/${receiptId}/pdf`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  downloadReceiptDocx(receiptId: string): Observable<HttpResponse<Blob>> {
    return this.httpClient.get(`/api/v1/admin/receipts/${receiptId}/docx`, {
      observe: 'response',
      responseType: 'blob'
    });
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
