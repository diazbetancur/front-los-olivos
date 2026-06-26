import { of, throwError } from 'rxjs';
import { AuthSessionService } from './auth-session.service';
import { AuthApiService } from './auth-api.service';
import { AuthStorageService } from './auth-storage.service';
import { AuthResponse } from './models/auth.models';

function buildResponse(roleName: string): AuthResponse {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    accessTokenExpiresAtUtc: '2099-01-01T00:00:00Z',
    tokenType: 'Bearer',
    user: {
      id: 'u1',
      userName: 'doc-123',
      email: 'cliente@example.com',
      firstName: 'Cli',
      lastName: 'Ente',
      isActive: true,
      roles: [{ id: 'r1', name: roleName }],
      permissions: []
    }
  };
}

describe('AuthSessionService login flow', () => {
  it('loginWithResponse sets the session from the response without calling /me', () => {
    let meCalled = false;
    const authApi = {
      me: () => {
        meCalled = true;
        return throwError(() => new Error('/me must not be called during login'));
      },
      login: () => of(buildResponse('Cliente')),
      refresh: () => throwError(() => new Error('refresh must not be called during login')),
      logout: () => of(void 0)
    } as unknown as AuthApiService;
    const authStorage = {
      load: () => null,
      save: () => undefined,
      clear: () => undefined
    } as unknown as AuthStorageService;

    const service = new AuthSessionService(authApi, authStorage);
    service.loginWithResponse(buildResponse('Cliente')).subscribe();

    expect(service.hasRole('Cliente')).toBe(true);
    expect(meCalled).toBe(false);
  });

  it('login sets the session from the response without calling /me', () => {
    let meCalled = false;
    const authApi = {
      me: () => {
        meCalled = true;
        return throwError(() => new Error('/me must not be called during login'));
      },
      login: () => of(buildResponse('superadmin')),
      refresh: () => throwError(() => new Error('refresh must not be called during login')),
      logout: () => of(void 0)
    } as unknown as AuthApiService;
    const authStorage = {
      load: () => null,
      save: () => undefined,
      clear: () => undefined
    } as unknown as AuthStorageService;

    const service = new AuthSessionService(authApi, authStorage);
    service.login({ identifier: 'admin', password: 'x' }).subscribe();

    expect(service.hasRole('superadmin')).toBe(true);
    expect(meCalled).toBe(false);
  });
});
