import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import {
  CreateUserRequest,
  GetUsersQuery,
  PagedResult,
  UpdateUserRequest,
  UserDetailResponse,
  UserListItemResponse
} from '../models/security.models';

@Injectable({ providedIn: 'root' })
export class UsersApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  getUsers(query: GetUsersQuery): Observable<PagedResult<UserListItemResponse>> {
    return this.apiClient.get<PagedResult<UserListItemResponse>>('/api/v1/admin/users', {
      params: this.toParams(query)
    });
  }

  createUser(request: CreateUserRequest): Observable<UserDetailResponse> {
    return this.apiClient.post<CreateUserRequest, UserDetailResponse>('/api/v1/admin/users', request);
  }

  getUserById(userId: string): Observable<UserDetailResponse> {
    return this.apiClient.get<UserDetailResponse>(`/api/v1/admin/users/${userId}`);
  }

  updateUser(userId: string, request: UpdateUserRequest): Observable<UserDetailResponse> {
    return this.apiClient.put<UpdateUserRequest, UserDetailResponse>(`/api/v1/admin/users/${userId}`, request);
  }

  disableUser(userId: string): Observable<void> {
    return this.apiClient.post<Record<string, never>, void>(`/api/v1/admin/users/${userId}/disable`, {});
  }

  private toParams(source: object): Record<string, string | number | boolean> {
    const entries = Object.entries(source).filter(([, value]) => value !== undefined && value !== null && value !== '');
    return Object.fromEntries(entries) as Record<string, string | number | boolean>;
  }
}
