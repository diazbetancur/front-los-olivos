import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  CancelContractRequest,
  ClientLookupItem,
  ContractDetailResponse,
  ContractInstallmentResponse,
  ContractListItemResponse,
  CreateContractRequest,
  GenerateContractDocumentsResponse,
  GeneratedDocumentResponse,
  GetContractsQuery,
  LotLookupItem,
  PagedResult,
  ProjectLookupItem,
  UpdateContractStatusRequest
} from '../models/contracts.models';

interface ProjectListQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  status?: string | null;
}

interface LotListQuery {
  page: number;
  pageSize: number;
  projectId?: string | null;
  blockId?: string | null;
  status?: string | null;
  search?: string | null;
  minArea?: number | null;
  maxArea?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
}

interface ClientListQuery {
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
export class ContractsApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  getContracts(query: GetContractsQuery): Observable<PagedResult<ContractListItemResponse>> {
    return this.apiClient.get<PagedResult<ContractListItemResponse>>('/api/v1/admin/contracts', {
      params: this.toParams(query)
    });
  }

  createContract(request: CreateContractRequest): Observable<ContractDetailResponse> {
    return this.apiClient.post<CreateContractRequest, ContractDetailResponse>('/api/v1/admin/contracts', request);
  }

  getContractById(contractId: string): Observable<ContractDetailResponse> {
    return this.apiClient.get<ContractDetailResponse>(`/api/v1/admin/contracts/${contractId}`);
  }

  updateContractStatus(contractId: string, request: UpdateContractStatusRequest): Observable<ContractDetailResponse> {
    return this.apiClient.patch<UpdateContractStatusRequest, ContractDetailResponse>(
      `/api/v1/admin/contracts/${contractId}/status`,
      request
    );
  }

  cancelContract(contractId: string, request: CancelContractRequest): Observable<ContractDetailResponse> {
    return this.apiClient.post<CancelContractRequest, ContractDetailResponse>(
      `/api/v1/admin/contracts/${contractId}/cancel`,
      request
    );
  }

  getSchedule(contractId: string): Observable<ReadonlyArray<ContractInstallmentResponse>> {
    return this.apiClient.get<ReadonlyArray<ContractInstallmentResponse>>(`/api/v1/admin/contracts/${contractId}/schedule`);
  }

  getDocuments(contractId: string): Observable<ReadonlyArray<GeneratedDocumentResponse>> {
    return this.apiClient.get<ReadonlyArray<GeneratedDocumentResponse>>(`/api/v1/admin/contracts/${contractId}/documents`);
  }

  generateDocuments(contractId: string): Observable<GenerateContractDocumentsResponse> {
    return this.apiClient.post<Record<string, never>, GenerateContractDocumentsResponse>(
      `/api/v1/admin/contracts/${contractId}/generate-documents`,
      {}
    );
  }

  getProjectOptions(query: ProjectListQuery): Observable<PagedResult<ProjectLookupItem>> {
    return this.apiClient.get<PagedResult<ProjectLookupItem>>('/api/v1/admin/projects', {
      params: this.toParams(query)
    });
  }

  getLotOptions(query: LotListQuery): Observable<PagedResult<LotLookupItem>> {
    return this.apiClient.get<PagedResult<LotLookupItem>>('/api/v1/admin/lots', {
      params: this.toParams(query)
    });
  }

  getClientOptions(query: ClientListQuery): Observable<PagedResult<ClientLookupItem>> {
    return this.apiClient.get<PagedResult<ClientLookupItem>>('/api/v1/admin/clients', {
      params: this.toParams(query)
    });
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source)
      .filter(([, value]) => value !== undefined && value !== null && value !== '');

    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
