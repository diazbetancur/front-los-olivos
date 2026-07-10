export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface RoleAssignmentResponse {
  id: string;
  name: string;
}

export interface CurrentUserResponse {
  id: string;
  userName: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  roles: ReadonlyArray<RoleAssignmentResponse>;
  permissions: ReadonlyArray<string>;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: CurrentUserResponse;
  tokenType: string;
}

export interface AuthSessionState {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  user: CurrentUserResponse;
  tokenType: string;
}

