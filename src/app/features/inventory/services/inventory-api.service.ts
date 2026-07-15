import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  ChangeLotStatusRequest,
  CreateLotRequest,
  CreateProjectRequest,
  GetLotsQuery,
  GetProjectsQuery,
  LotDetailResponse,
  LotImportConfirmRequest,
  LotImportConfirmResponse,
  LotImportPreviewResponse,
  LotListItemResponse,
  PagedResult,
  ProjectDetailResponse,
  ProjectListItemResponse,
  UpdateLotRequest,
  UpdateProjectRequest
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryApiService {
  constructor(
    private readonly apiClient: ApiClientService,
    private readonly httpClient: HttpClient
  ) {}

  getProjects(query: GetProjectsQuery): Observable<PagedResult<ProjectListItemResponse>> {
    return this.apiClient.get<PagedResult<ProjectListItemResponse>>('/api/v1/admin/projects', {
      params: this.toParams(query)
    });
  }

  createProject(request: CreateProjectRequest): Observable<ProjectDetailResponse> {
    return this.apiClient.post<CreateProjectRequest, ProjectDetailResponse>('/api/v1/admin/projects', request);
  }

  getProjectById(projectId: string): Observable<ProjectDetailResponse> {
    return this.apiClient.get<ProjectDetailResponse>(`/api/v1/admin/projects/${projectId}`);
  }

  updateProject(projectId: string, request: UpdateProjectRequest): Observable<ProjectDetailResponse> {
    return this.apiClient.put<UpdateProjectRequest, ProjectDetailResponse>(`/api/v1/admin/projects/${projectId}`, request);
  }

  disableProject(projectId: string): Observable<void> {
    return this.apiClient.post<Record<string, never>, void>(`/api/v1/admin/projects/${projectId}/disable`, {});
  }

  getLots(query: GetLotsQuery): Observable<PagedResult<LotListItemResponse>> {
    return this.apiClient.get<PagedResult<LotListItemResponse>>('/api/v1/admin/lots', {
      params: this.toParams(query)
    });
  }

  getBlocks(projectId: string): Observable<{ blocks: string[] }> {
    return this.apiClient.get<{ blocks: string[] }>(`/api/v1/admin/lots/projects/${projectId}/blocks`);
  }

  createLot(request: CreateLotRequest): Observable<LotDetailResponse> {
    return this.apiClient.post<CreateLotRequest, LotDetailResponse>('/api/v1/admin/lots', request);
  }

  getLotById(lotId: string): Observable<LotDetailResponse> {
    return this.apiClient.get<LotDetailResponse>(`/api/v1/admin/lots/${lotId}`);
  }

  updateLot(lotId: string, request: UpdateLotRequest): Observable<LotDetailResponse> {
    return this.apiClient.put<UpdateLotRequest, LotDetailResponse>(`/api/v1/admin/lots/${lotId}`, request);
  }

  reserveLot(lotId: string, request: ChangeLotStatusRequest): Observable<LotDetailResponse> {
    return this.changeLotStatus(lotId, 'reserve', request);
  }

  releaseLot(lotId: string, request: ChangeLotStatusRequest): Observable<LotDetailResponse> {
    return this.changeLotStatus(lotId, 'release', request);
  }

  blockLot(lotId: string, request: ChangeLotStatusRequest): Observable<LotDetailResponse> {
    return this.changeLotStatus(lotId, 'block', request);
  }

  unblockLot(lotId: string, request: ChangeLotStatusRequest): Observable<LotDetailResponse> {
    return this.changeLotStatus(lotId, 'unblock', request);
  }

  cancelLot(lotId: string, request: ChangeLotStatusRequest): Observable<LotDetailResponse> {
    return this.changeLotStatus(lotId, 'cancel', request);
  }

  uploadProjectLogo(projectId: string, file: File): Observable<ProjectDetailResponse> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.httpClient.post<ProjectDetailResponse>(`/api/v1/admin/projects/${projectId}/logo`, formData);
  }

  previewLotImport(projectId: string, file: File): Observable<LotImportPreviewResponse> {
    const formData = new FormData();
    formData.append('projectId', projectId);
    formData.append('file', file, file.name);

    return this.httpClient.post<LotImportPreviewResponse>('/api/v1/admin/lots/import/preview', formData);
  }

  confirmLotImport(request: LotImportConfirmRequest): Observable<LotImportConfirmResponse> {
    return this.apiClient.post<LotImportConfirmRequest, LotImportConfirmResponse>('/api/v1/admin/lots/import/confirm', request);
  }

  private changeLotStatus(
    lotId: string,
    action: 'reserve' | 'release' | 'block' | 'unblock' | 'cancel',
    request: ChangeLotStatusRequest
  ): Observable<LotDetailResponse> {
    return this.apiClient.post<ChangeLotStatusRequest, LotDetailResponse>(`/api/v1/admin/lots/${lotId}/${action}`, request);
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source)
      .filter(([, value]) => value !== undefined && value !== null && value !== '');

    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
