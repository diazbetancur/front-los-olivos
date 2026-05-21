export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface GetUsersQuery {
  page: number;
  pageSize: number;
  search?: string | null;
}

export interface RoleAssignmentResponse {
  id: string;
  name: string;
}

export interface UserListItemResponse {
  id: string;
  userName?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
  roles?: ReadonlyArray<RoleAssignmentResponse> | null;
}

export interface UserDetailResponse {
  id: string;
  userName?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  isActive: boolean;
  lastLoginAtUtc?: string | null;
  roles?: ReadonlyArray<RoleAssignmentResponse> | null;
  permissions?: ReadonlyArray<string> | null;
}

export interface CreateUserRequest {
  userName?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  password?: string | null;
  roleIds?: ReadonlyArray<string> | null;
  isActive: boolean;
}

export interface UpdateUserRequest {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  roleIds?: ReadonlyArray<string> | null;
  isActive: boolean;
}

export interface GetRolesQuery {
  page: number;
  pageSize: number;
  search?: string | null;
}

export interface RoleListItemResponse {
  id: string;
  name?: string | null;
  description?: string | null;
  isActive: boolean;
  permissionCount: number;
}

export interface PermissionResponse {
  id: string;
  code?: string | null;
  description?: string | null;
  category?: string | null;
  isActive: boolean;
}

export interface RoleDetailResponse {
  id: string;
  name?: string | null;
  description?: string | null;
  isActive: boolean;
  permissions?: ReadonlyArray<PermissionResponse> | null;
}

export interface CreateRoleRequest {
  name?: string | null;
  description?: string | null;
  permissionCodes?: ReadonlyArray<string> | null;
  isActive: boolean;
}

export interface UpdateRoleRequest {
  name?: string | null;
  description?: string | null;
  isActive: boolean;
}

export interface UpdateRolePermissionsRequest {
  permissionCodes?: ReadonlyArray<string> | null;
}
