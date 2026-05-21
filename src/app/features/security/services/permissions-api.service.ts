import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from '../../../core/http/api-client.service';
import { PermissionResponse } from '../models/security.models';

@Injectable({ providedIn: 'root' })
export class PermissionsApiService {
  constructor(private readonly apiClient: ApiClientService) {}

  getPermissions(): Observable<ReadonlyArray<PermissionResponse>> {
    return this.apiClient.get<ReadonlyArray<PermissionResponse>>('/api/v1/admin/permissions');
  }
}
