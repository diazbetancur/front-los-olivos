import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../http/api-client.service';
import {
  AuthResponse,
  CurrentUserResponse,
  LoginRequest,
  LogoutRequest,
  RefreshTokenRequest
} from './models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.apiClient.post<LoginRequest, AuthResponse>('/api/v1/auth/login', request);
  }

  refresh(request: RefreshTokenRequest): Observable<AuthResponse> {
    return this.apiClient.post<RefreshTokenRequest, AuthResponse>('/api/v1/auth/refresh', request);
  }

  logout(request: LogoutRequest): Observable<void> {
    return this.apiClient.post<LogoutRequest, void>('/api/v1/auth/logout', request);
  }

  me(): Observable<CurrentUserResponse> {
    return this.apiClient.get<CurrentUserResponse>('/api/v1/auth/me');
  }
}

