import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  CreateRoleRequest,
  GetRolesQuery,
  PagedResult,
  RoleDetailResponse,
  RoleListItemResponse,
  UpdateRolePermissionsRequest,
  UpdateRoleRequest
} from '../models/security.models';

@Injectable({ providedIn: 'root' })
export class RolesApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  getRoles(query: GetRolesQuery): Observable<PagedResult<RoleListItemResponse>> {
    return this.apiClient.get<PagedResult<RoleListItemResponse>>('/api/v1/admin/roles', {
      params: this.toParams(query)
    });
  }

  createRole(request: CreateRoleRequest): Observable<RoleDetailResponse> {
    return this.apiClient.post<CreateRoleRequest, RoleDetailResponse>('/api/v1/admin/roles', request);
  }

  getRoleById(roleId: string): Observable<RoleDetailResponse> {
    return this.apiClient.get<RoleDetailResponse>(`/api/v1/admin/roles/${roleId}`);
  }

  updateRole(roleId: string, request: UpdateRoleRequest): Observable<RoleDetailResponse> {
    return this.apiClient.put<UpdateRoleRequest, RoleDetailResponse>(`/api/v1/admin/roles/${roleId}`, request);
  }

  updateRolePermissions(roleId: string, request: UpdateRolePermissionsRequest): Observable<RoleDetailResponse> {
    return this.apiClient.put<UpdateRolePermissionsRequest, RoleDetailResponse>(
      `/api/v1/admin/roles/${roleId}/permissions`,
      request
    );
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
