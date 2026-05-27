import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import {
  CreateRoleRequest,
  GetRolesQuery,
  PagedResult,
  PermissionResponse,
  RoleDetailResponse,
  RoleListItemResponse,
  UpdateRolePermissionsRequest,
  UpdateRoleRequest
} from '../models/security.models';
import { PermissionsApiService } from '../services/permissions-api.service';
import { RolesApiService } from '../services/roles-api.service';

interface PermissionGroup {
  category: string;
  permissions: ReadonlyArray<PermissionResponse>;
}

@Component({
  selector: 'app-roles-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent
  ],
  templateUrl: './roles-page.component.html',
  styleUrl: './roles-page.component.scss'
})
export class RolesPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly rolesApi = inject(RolesApiService);
  private readonly permissionsApi = inject(PermissionsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canManage = computed(() => this.authSession.hasPermission('Roles.Manage'));
  readonly canViewPermissions = computed(() => this.authSession.hasPermission('Permissions.View'));

  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(256)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly roleForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(128)]],
    description: ['', [Validators.maxLength(512)]],
    isActive: [true, [Validators.required]]
  });

  roles: ReadonlyArray<RoleListItemResponse> = [];
  permissionCatalog: ReadonlyArray<PermissionResponse> = [];
  selectedRoleDetail: RoleDetailResponse | null = null;
  selectedPermissionCodes: ReadonlyArray<string> = [];
  permissionSearchTerm = '';

  currentPage = 1;
  totalCount = 0;
  editingRoleId: string | null = null;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isPermissionsLoading = false;
  showForm = false;
  showRoleDetailModal = false;
  showSavePermissionsConfirmModal = false;

  formSubmitted = false;
  listError: string | null = null;
  formError: string | null = null;
  detailError: string | null = null;
  permissionsError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  ngOnInit(): void {
    this.loadPermissionCatalog();
    this.loadRoles(1);
  }

  applyFilters(): void {
    this.loadRoles(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      search: '',
      pageSize: 20
    });
    this.loadRoles(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadRoles(1);
  }

  openCreateForm(): void {
    this.editingRoleId = null;
    this.formError = null;
    this.formSubmitted = false;
    this.showForm = true;
    this.roleForm.enable({ emitEvent: false });
    this.roleForm.reset({
      name: '',
      description: '',
      isActive: true
    });
  }

  openEditForm(roleId: string): void {
    this.editingRoleId = roleId;
    this.formError = null;
    this.formSubmitted = false;
    this.showForm = true;
    this.isSubmitting = true;
    this.roleForm.disable({ emitEvent: false });

    this.rolesApi
      .getRoleById(roleId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (role) => {
          this.fillForm(role);
          this.roleForm.enable({ emitEvent: false });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
          this.roleForm.enable({ emitEvent: false });
        }
      });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingRoleId = null;
    this.formSubmitted = false;
    this.formError = null;
  }

  submitRole(): void {
    this.formSubmitted = true;
    this.formError = null;
    if (this.roleForm.invalid) {
      this.roleForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;

    const request$ = this.editingRoleId
      ? this.rolesApi.updateRole(this.editingRoleId, this.toUpdatePayload())
      : this.rolesApi.createRole(this.toCreatePayload());

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.showSuccess(this.editingRoleId ? 'Rol actualizado correctamente.' : 'Rol creado correctamente.');
          const targetPage = this.editingRoleId ? this.currentPage : 1;
          this.cancelForm();
          this.reloadAfterMutation({
            page: targetPage
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showWarning(normalizedError.userMessage);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  viewRoleDetail(roleId: string): void {
    this.detailError = null;
    this.permissionsError = null;
    this.selectedRoleDetail = null;
    this.selectedPermissionCodes = [];
    this.permissionSearchTerm = '';
    this.isDetailLoading = true;
    this.showRoleDetailModal = true;

    this.rolesApi
      .getRoleById(roleId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.selectedRoleDetail = response;
          this.selectedPermissionCodes = (response.permissions ?? [])
            .map((permission) => permission.code ?? '')
            .filter((code) => code.trim().length > 0);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  closeRoleDetailModal(): void {
    this.showRoleDetailModal = false;
    this.showSavePermissionsConfirmModal = false;
    this.detailError = null;
    this.permissionsError = null;
    this.selectedRoleDetail = null;
    this.selectedPermissionCodes = [];
    this.permissionSearchTerm = '';
  }

  setPermissionSearchTerm(value: string): void {
    this.permissionSearchTerm = value.trim().toLowerCase();
  }

  isPermissionSelected(code: string | null | undefined): boolean {
    if (!code) {
      return false;
    }
    return this.selectedPermissionCodes.includes(code);
  }

  togglePermission(code: string | null | undefined, checked: boolean): void {
    if (!code || !this.canManage()) {
      return;
    }

    const current = this.selectedPermissionCodes;
    this.selectedPermissionCodes = checked
      ? [...new Set([...current, code])]
      : current.filter((item) => item !== code);
  }

  requestSavePermissions(): void {
    if (!this.selectedRoleDetail || !this.canManage()) {
      return;
    }
    this.permissionsError = null;
    this.showSavePermissionsConfirmModal = true;
  }

  cancelSavePermissions(): void {
    this.showSavePermissionsConfirmModal = false;
  }

  confirmSavePermissions(): void {
    if (!this.selectedRoleDetail || !this.canManage()) {
      return;
    }

    this.showSavePermissionsConfirmModal = false;
    this.permissionsError = null;
    this.isPermissionsLoading = true;

    const payload: UpdateRolePermissionsRequest = {
      permissionCodes: this.selectedPermissionCodes
    };

    this.rolesApi
      .updateRolePermissions(this.selectedRoleDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isPermissionsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.showSuccess('Permisos del rol actualizados correctamente.');
          this.selectedRoleDetail = response;
          this.selectedPermissionCodes = (response.permissions ?? [])
            .map((permission) => permission.code ?? '')
            .filter((code) => code.trim().length > 0);
          this.loadRoles(this.currentPage);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.permissionsError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showWarning(normalizedError.userMessage);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  permissionCount(detail: RoleDetailResponse | null): number {
    return detail?.permissions?.length ?? 0;
  }

  permissionGroups(): ReadonlyArray<PermissionGroup> {
    return this.groupPermissions(this.permissionCatalog, this.permissionSearchTerm);
  }

  selectedPermissionCount(): number {
    return this.selectedPermissionCodes.length;
  }

  visiblePermissionCount(): number {
    return this.permissionGroups().reduce((total, group) => total + group.permissions.length, 0);
  }

  permissionGroupLabel(category: string): string {
    const normalized = category.trim();
    if (!normalized) {
      return 'General';
    }

    const aliases: Record<string, string> = {
      users: 'Users',
      roles: 'Roles',
      permissions: 'Permissions',
      projects: 'Projects',
      lots: 'Lots',
      clients: 'Clients',
      contracts: 'Contracts',
      payments: 'Payments',
      receipts: 'Receipts',
      documents: 'Documents',
      reports: 'Reports',
      audit: 'Audit'
    };

    const key = normalized.toLowerCase();
    return aliases[key] ?? normalized;
  }

  statusClass(isActive: boolean): string {
    return isActive ? 'status-badge approved' : 'status-badge blocked';
  }

  protected loadRoles(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetRolesQuery = {
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      search: this.cleanString(this.filterForm.controls.search.value)
    };

    this.rolesApi
      .getRoles(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<RoleListItemResponse>) => {
          this.roles = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadPermissionCatalog(): void {
    if (!this.canViewPermissions()) {
      this.permissionCatalog = [];
      return;
    }

    this.permissionsApi
      .getPermissions()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (permissions) => {
          this.permissionCatalog = [...permissions].sort((a, b) =>
            (a.code ?? '').localeCompare(b.code ?? '', undefined, { sensitivity: 'base' })
          );
          this.syncView();
        },
        error: () => {
          this.permissionCatalog = [];
          this.syncView();
        }
      });
  }

  private groupPermissions(source: ReadonlyArray<PermissionResponse>, searchTerm: string): ReadonlyArray<PermissionGroup> {
    const byCategory = new Map<string, PermissionResponse[]>();

    for (const permission of source) {
      if (searchTerm.length > 0) {
        const haystack = `${permission.code ?? ''} ${permission.description ?? ''} ${permission.category ?? ''}`.toLowerCase();
        if (!haystack.includes(searchTerm)) {
          continue;
        }
      }

      const category = this.resolvePermissionCategory(permission);
      const list = byCategory.get(category) ?? [];
      list.push(permission);
      byCategory.set(category, list);
    }

    return [...byCategory.entries()]
      .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
      .map(([category, permissions]) => ({
        category,
        permissions: permissions.sort((left, right) =>
          (left.code ?? '').localeCompare(right.code ?? '', undefined, { sensitivity: 'base' })
        )
      }));
  }

  private resolvePermissionCategory(permission: PermissionResponse): string {
    const explicit = permission.category?.trim();
    if (explicit && explicit.length > 0) {
      return explicit;
    }

    const code = permission.code?.trim() ?? '';
    if (code.includes('.')) {
      return code.split('.')[0];
    }

    return 'General';
  }

  private fillForm(role: RoleDetailResponse): void {
    this.roleForm.reset({
      name: role.name?.trim() ?? '',
      description: role.description?.trim() ?? '',
      isActive: role.isActive
    });
  }

  private toCreatePayload(): CreateRoleRequest {
    const raw = this.roleForm.getRawValue();
    return {
      name: raw.name.trim(),
      description: this.cleanString(raw.description),
      permissionCodes: [],
      isActive: raw.isActive
    };
  }

  private toUpdatePayload(): UpdateRoleRequest {
    const raw = this.roleForm.getRawValue();
    return {
      name: raw.name.trim(),
      description: this.cleanString(raw.description),
      isActive: raw.isActive
    };
  }

  private reloadAfterMutation(options: { page: number; roleId?: string }): void {
    this.loadRoles(options.page);
    if (options.roleId) {
      this.viewRoleDetail(options.roleId);
    }
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
