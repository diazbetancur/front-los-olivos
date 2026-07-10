import { Injectable, computed, signal } from '@angular/core';
import { Observable, of, shareReplay, tap, map, catchError, finalize, throwError, timeout } from 'rxjs';
import { AuthApiService } from './auth-api.service';
import { AuthStorageService } from './auth-storage.service';
import { AuthResponse, AuthSessionState, CurrentUserResponse, LoginRequest } from './models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  private static readonly adminRoleNames = new Set(['superadmin', 'admin', 'ventas', 'caja', 'auditor']);

  private readonly sessionState = signal<AuthSessionState | null>(null);
  private refreshInFlight$: Observable<AuthSessionState> | null = null;

  readonly session = computed(() => this.sessionState());
  readonly currentUser = computed(() => this.sessionState()?.user ?? null);
  readonly permissions = computed(() => this.sessionState()?.user.permissions ?? []);
  readonly roles = computed(() => this.sessionState()?.user.roles ?? []);
  readonly isAuthenticated = computed(() => this.sessionState() !== null);
  readonly mustChangePassword = computed(() => this.sessionState()?.user.mustChangePassword ?? false);

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authStorage: AuthStorageService
  ) {
    this.sessionState.set(this.authStorage.load());

    if (this.sessionState()) {
      this.refreshCurrentUser().pipe(catchError(() => of(null))).subscribe();
    }
  }

  login(request: LoginRequest): Observable<AuthSessionState> {
    return this.authApi.login(request).pipe(
      map((response) => this.toSessionState(response)),
      tap((session) => this.setSession(session))
    );
  }

  loginWithResponse(response: AuthResponse): Observable<AuthSessionState> {
    return of(this.toSessionState(response)).pipe(
      tap((session) => this.setSession(session))
    );
  }

  logout(): Observable<void> {
    const currentSession = this.sessionState();
    if (!currentSession?.refreshToken) {
      this.clearSession();
      return of(void 0);
    }

    return this.authApi.logout({ refreshToken: currentSession.refreshToken }).pipe(
      catchError(() => of(void 0)),
      tap(() => this.clearSession()),
      map(() => void 0)
    );
  }

  refreshAccessToken(): Observable<AuthSessionState> {
    const refreshToken = this.sessionState()?.refreshToken;
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available.'));
    }

    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    this.refreshInFlight$ = this.authApi.refresh({ refreshToken }).pipe(
      timeout(15_000),
      map((response) => this.toSessionState(response)),
      tap((session) => this.setSession(session)),
      catchError((error) => {
        this.refreshInFlight$ = null;
        return throwError(() => error);
      }),
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
      shareReplay(1)
    );

    return this.refreshInFlight$;
  }

  refreshCurrentUser(): Observable<CurrentUserResponse> {
    return this.authApi.me().pipe(
      tap((user) => {
        const currentSession = this.sessionState();
        if (!currentSession) {
          return;
        }

        this.setSession({
          ...currentSession,
          user
        });
      })
    );
  }

  getAccessToken(): string | null {
    return this.sessionState()?.accessToken ?? null;
  }

  hasPermission(permissionCode: string): boolean {
    return this.permissions().some((permission) => permission === permissionCode);
  }

  hasAnyPermission(permissionCodes: ReadonlyArray<string>): boolean {
    if (permissionCodes.length === 0) {
      return true;
    }

    const permissionSet = new Set(this.permissions());
    return permissionCodes.some((permissionCode) => permissionSet.has(permissionCode));
  }

  hasRole(roleName: string): boolean {
    const normalizedRole = roleName.trim().toLowerCase();
    return this.roles().some((role) => role.name.trim().toLowerCase() === normalizedRole);
  }

  hasAnyRole(roleNames: ReadonlyArray<string>): boolean {
    if (roleNames.length === 0) {
      return true;
    }

    const normalizedRoles = new Set(roleNames.map((roleName) => roleName.trim().toLowerCase()));
    return this.roles().some((role) => normalizedRoles.has(role.name.trim().toLowerCase()));
  }

  resolveHomeRoute(): string {
    if (this.mustChangePassword()) {
      return '/client/cambiar-password';
    }

    const roles = this.roles();
    const hasAdminRole = roles.some((role) =>
      AuthSessionService.adminRoleNames.has(role.name.trim().toLowerCase())
    );

    if (hasAdminRole) {
      return '/admin/dashboard';
    }

    if (this.hasRole('Cliente')) {
      return '/client/contracts';
    }

    return '/admin/dashboard';
  }

  clearSession(): void {
    this.sessionState.set(null);
    this.authStorage.clear();
  }

  private setSession(session: AuthSessionState): void {
    this.sessionState.set(session);
    this.authStorage.save(session);
  }

  private toSessionState(response: AuthResponse): AuthSessionState {
    return {
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      accessTokenExpiresAtUtc: response.accessTokenExpiresAtUtc,
      user: response.user,
      tokenType: response.tokenType || 'Bearer'
    };
  }
}
