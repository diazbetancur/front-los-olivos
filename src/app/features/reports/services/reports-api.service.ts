import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  AuditLogListItemResponse,
  ClientLookupItem,
  ContractInArrearsResponse,
  ContractLookupItem,
  ContractStatusSummaryResponse,
  GetAuditLogsQuery,
  GetContractsInArrearsQuery,
  GetPaymentsByDateRangeQuery,
  GetProjectBalanceSummaryQuery,
  GetVoidedReceiptsQuery,
  LotStatusSummaryResponse,
  PagedResult,
  PaymentsByDateRangeResponse,
  ProjectBalanceSummaryResponse,
  ProjectLookupItem,
  VoidedReceiptResponse
} from '../models/reports.models';

interface GetProjectsLookupQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  status?: string | null;
}

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
export class ReportsApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  getLotStatusSummary(projectId?: string | null): Observable<ReadonlyArray<LotStatusSummaryResponse>> {
    return this.apiClient.get<ReadonlyArray<LotStatusSummaryResponse>>('/api/v1/admin/reports/lots/status-summary', {
      params: this.toParams({ projectId })
    });
  }

  getContractStatusSummary(params: {
    projectId?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
  }): Observable<ReadonlyArray<ContractStatusSummaryResponse>> {
    return this.apiClient.get<ReadonlyArray<ContractStatusSummaryResponse>>('/api/v1/admin/reports/contracts/status-summary', {
      params: this.toParams(params)
    });
  }

  getContractsInArrears(query: GetContractsInArrearsQuery): Observable<PagedResult<ContractInArrearsResponse>> {
    return this.apiClient.get<PagedResult<ContractInArrearsResponse>>('/api/v1/admin/reports/contracts/in-arrears', {
      params: this.toParams(query)
    });
  }

  getPaymentsByDateRange(query: GetPaymentsByDateRangeQuery): Observable<PaymentsByDateRangeResponse> {
    return this.apiClient.get<PaymentsByDateRangeResponse>('/api/v1/admin/reports/payments/by-date-range', {
      params: this.toParams(query)
    });
  }

  getProjectBalances(query: GetProjectBalanceSummaryQuery): Observable<PagedResult<ProjectBalanceSummaryResponse>> {
    return this.apiClient.get<PagedResult<ProjectBalanceSummaryResponse>>('/api/v1/admin/reports/balances/by-project', {
      params: this.toParams(query)
    });
  }

  getVoidedReceipts(query: GetVoidedReceiptsQuery): Observable<PagedResult<VoidedReceiptResponse>> {
    return this.apiClient.get<PagedResult<VoidedReceiptResponse>>('/api/v1/admin/reports/receipts/voided', {
      params: this.toParams(query)
    });
  }

  getAuditLogs(query: GetAuditLogsQuery): Observable<PagedResult<AuditLogListItemResponse>> {
    return this.apiClient.get<PagedResult<AuditLogListItemResponse>>('/api/v1/admin/audit-logs', {
      params: this.toParams(query)
    });
  }

  getProjectsLookup(query: GetProjectsLookupQuery): Observable<PagedResult<ProjectLookupItem>> {
    return this.apiClient.get<PagedResult<ProjectLookupItem>>('/api/v1/admin/projects', {
      params: this.toParams(query)
    });
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
