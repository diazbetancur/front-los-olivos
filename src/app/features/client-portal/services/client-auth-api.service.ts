import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import { AuthResponse } from '../../../core/auth/models/auth.models';
import {
  ChangeClientPasswordRequest,
  ClientLoginRequest,
  ClientProfileResponse,
  ClientRegisterRequest,
  ForgotClientPasswordRequest,
  ResetClientPasswordRequest,
  UpdateClientProfileRequest
} from '../models/client-auth.models';

@Injectable({ providedIn: 'root' })
export class ClientAuthApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  register(request: ClientRegisterRequest): Observable<{ message: string }> {
    return this.apiClient.post<ClientRegisterRequest, { message: string }>(
      '/api/v1/client/auth/register',
      request
    );
  }

  login(request: ClientLoginRequest): Observable<AuthResponse> {
    return this.apiClient.post<ClientLoginRequest, AuthResponse>(
      '/api/v1/client/auth/login',
      request
    );
  }

  changePassword(request: ChangeClientPasswordRequest): Observable<{ message: string }> {
    return this.apiClient.put<ChangeClientPasswordRequest, { message: string }>(
      '/api/v1/client/auth/change-password',
      request
    );
  }

  forgotPassword(request: ForgotClientPasswordRequest): Observable<{ message: string }> {
    return this.apiClient.post<ForgotClientPasswordRequest, { message: string }>(
      '/api/v1/client/auth/forgot-password',
      request
    );
  }

  resetPassword(request: ResetClientPasswordRequest): Observable<{ message: string }> {
    return this.apiClient.post<ResetClientPasswordRequest, { message: string }>(
      '/api/v1/client/auth/reset-password',
      request
    );
  }

  getProfile(): Observable<ClientProfileResponse> {
    return this.apiClient.get<ClientProfileResponse>('/api/v1/client/profile');
  }

  updateProfile(request: UpdateClientProfileRequest): Observable<ClientProfileResponse> {
    return this.apiClient.put<UpdateClientProfileRequest, ClientProfileResponse>(
      '/api/v1/client/profile',
      request
    );
  }
}
