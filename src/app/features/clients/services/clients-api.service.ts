import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  ClientBeneficiaryResponse,
  ClientDetailResponse,
  ClientListItemResponse,
  ClientReferenceResponse,
  CreateClientBeneficiaryRequest,
  CreateClientRequest,
  CreateClientReferenceRequest,
  GetClientsQuery,
  PagedResult,
  ResetClientPortalPasswordResponse,
  UpdateClientBeneficiaryRequest,
  UpdateClientRequest,
  UpdateClientReferenceRequest
} from '../models/clients.models';

@Injectable({ providedIn: 'root' })
export class ClientsApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  getClients(query: GetClientsQuery): Observable<PagedResult<ClientListItemResponse>> {
    return this.apiClient.get<PagedResult<ClientListItemResponse>>('/api/v1/admin/clients', {
      params: this.toParams(query)
    });
  }

  createClient(request: CreateClientRequest): Observable<ClientDetailResponse> {
    return this.apiClient.post<CreateClientRequest, ClientDetailResponse>('/api/v1/admin/clients', request);
  }

  getClientById(clientId: string): Observable<ClientDetailResponse> {
    return this.apiClient.get<ClientDetailResponse>(`/api/v1/admin/clients/${clientId}`);
  }

  updateClient(clientId: string, request: UpdateClientRequest): Observable<ClientDetailResponse> {
    return this.apiClient.put<UpdateClientRequest, ClientDetailResponse>(`/api/v1/admin/clients/${clientId}`, request);
  }

  disableClient(clientId: string): Observable<void> {
    return this.apiClient.post<Record<string, never>, void>(`/api/v1/admin/clients/${clientId}/disable`, {});
  }

  resetPortalPassword(clientId: string): Observable<ResetClientPortalPasswordResponse> {
    return this.apiClient.post<Record<string, never>, ResetClientPortalPasswordResponse>(
      `/api/v1/admin/clients/${clientId}/reset-password`,
      {}
    );
  }

  getBeneficiaries(clientId: string): Observable<ReadonlyArray<ClientBeneficiaryResponse>> {
    return this.apiClient.get<ReadonlyArray<ClientBeneficiaryResponse>>(`/api/v1/admin/clients/${clientId}/beneficiaries`);
  }

  createBeneficiary(clientId: string, request: CreateClientBeneficiaryRequest): Observable<ClientBeneficiaryResponse> {
    return this.apiClient.post<CreateClientBeneficiaryRequest, ClientBeneficiaryResponse>(
      `/api/v1/admin/clients/${clientId}/beneficiaries`,
      request
    );
  }

  updateBeneficiary(beneficiaryId: string, request: UpdateClientBeneficiaryRequest): Observable<ClientBeneficiaryResponse> {
    return this.apiClient.put<UpdateClientBeneficiaryRequest, ClientBeneficiaryResponse>(
      `/api/v1/admin/client-beneficiaries/${beneficiaryId}`,
      request
    );
  }

  deleteBeneficiary(beneficiaryId: string): Observable<void> {
    return this.apiClient.delete<void>(`/api/v1/admin/client-beneficiaries/${beneficiaryId}`);
  }

  getReferences(clientId: string): Observable<ReadonlyArray<ClientReferenceResponse>> {
    return this.apiClient.get<ReadonlyArray<ClientReferenceResponse>>(`/api/v1/admin/clients/${clientId}/references`);
  }

  createReference(clientId: string, request: CreateClientReferenceRequest): Observable<ClientReferenceResponse> {
    return this.apiClient.post<CreateClientReferenceRequest, ClientReferenceResponse>(
      `/api/v1/admin/clients/${clientId}/references`,
      request
    );
  }

  updateReference(referenceId: string, request: UpdateClientReferenceRequest): Observable<ClientReferenceResponse> {
    return this.apiClient.put<UpdateClientReferenceRequest, ClientReferenceResponse>(
      `/api/v1/admin/client-references/${referenceId}`,
      request
    );
  }

  deleteReference(referenceId: string): Observable<void> {
    return this.apiClient.delete<void>(`/api/v1/admin/client-references/${referenceId}`);
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
