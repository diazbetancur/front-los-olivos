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
import { PasswordRulesComponent } from '../components/password-rules/password-rules';

import {
  CreateUserRequest,
  GetUsersQuery,
  PagedResult,
  RoleListItemResponse,
  UpdateUserRequest,
  UserDetailResponse,
  UserListItemResponse
} from '../models/security.models';
import { RolesApiService } from '../services/roles-api.service';
import { UsersApiService } from '../services/users-api.service';

const LOOKUP_PAGE_SIZE = 100;

@Component({
  selector: 'app-users-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent,
    PasswordRulesComponent
  ],
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss'
})
export class UsersPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly usersApi = inject(UsersApiService);
  private readonly rolesApi = inject(RolesApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canCreate = computed(() => this.authSession.hasPermission('Users.Create'));
  readonly canUpdate = computed(() => this.authSession.hasPermission('Users.Update'));
  readonly canDisable = computed(() => this.authSession.hasPermission('Users.Disable'));
  readonly canViewRoles = computed(() => this.authSession.hasPermission('Roles.View'));

  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(256)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly userForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    firstName: ['', [Validators.required, Validators.maxLength(128)]],
    lastName: ['', [Validators.required, Validators.maxLength(128)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(256)]],
    newPassword: ['', [Validators.minLength(12), Validators.maxLength(256)]],
    isActive: [true, [Validators.required]],
    roleIds: this.formBuilder.nonNullable.control<ReadonlyArray<string>>([], [Validators.minLength(1)])
  });

  users: ReadonlyArray<UserListItemResponse> = [];
  roleOptions: ReadonlyArray<RoleListItemResponse> = [];
  selectedUserDetail: UserDetailResponse | null = null;
  pendingDisableUser: UserListItemResponse | null = null;

  currentPage = 1;
  totalCount = 0;
  editingUserId: string | null = null;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isLookupLoading = false;
  showForm = false;
  showUserDetailModal = false;
  showDisableConfirmModal = false;

  formSubmitted = false;
  listError: string | null = null;
  formError: string | null = null;
  detailError: string | null = null;
  disableError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  ngOnInit(): void {
    this.loadRoleOptions();
    this.loadUsers(1);
  }

  applyFilters(): void {
    this.loadUsers(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      search: '',
      pageSize: 20
    });
    this.loadUsers(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadUsers(1);
  }

  openCreateForm(): void {
    this.editingUserId = null;
    this.formError = null;
    this.formSubmitted = false;
    this.showForm = true;
    this.userForm.enable({ emitEvent: false });
    this.userForm.controls.newPassword.disable({ emitEvent: false });
    this.userForm.controls.password.setValidators([Validators.required, Validators.minLength(12), Validators.maxLength(256)]);
    this.userForm.reset({
      email: '',
      firstName: '',
      lastName: '',
      password: '',
      newPassword: '',
      isActive: true,
      roleIds: []
    });
    this.userForm.controls.password.updateValueAndValidity({ emitEvent: false });
  }

  openEditForm(userId: string): void {
    this.editingUserId = userId;
    this.formError = null;
    this.formSubmitted = false;
    this.showForm = true;
    this.isSubmitting = true;
    this.userForm.disable({ emitEvent: false });

    this.userForm.controls.password.disable({ emitEvent: false });
    this.userForm.controls.password.clearValidators();
    this.userForm.controls.password.updateValueAndValidity({ emitEvent: false });

    this.usersApi
      .getUserById(userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (user) => {
          this.fillForm(user);
          this.userForm.enable({ emitEvent: false });
          this.userForm.controls.password.disable({ emitEvent: false });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
          this.userForm.enable({ emitEvent: false });
          this.userForm.controls.password.disable({ emitEvent: false });
        }
      });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingUserId = null;
    this.formSubmitted = false;
    this.formError = null;
    this.syncView();
  }

  isRoleSelected(roleId: string): boolean {
    return this.userForm.controls.roleIds.value.includes(roleId);
  }

  toggleRole(roleId: string, checked: boolean): void {
    const current = this.selectedRoleIds();
    const updated = checked ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId);
    this.userForm.controls.roleIds.setValue(updated);
    this.userForm.controls.roleIds.markAsDirty();
    this.userForm.controls.roleIds.updateValueAndValidity();
  }

  submitUser(): void {
    this.formSubmitted = true;
    this.formError = null;
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    if (this.selectedRoleIds().length === 0) {
      this.formError = 'Debes asignar al menos un rol al usuario.';
      return;
    }

    this.isSubmitting = true;

    const request$ = this.editingUserId
      ? this.usersApi.updateUser(this.editingUserId, this.toUpdatePayload())
      : this.usersApi.createUser(this.toCreatePayload());

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
          this.feedback.showSuccess(this.editingUserId ? 'Usuario actualizado correctamente.' : 'Usuario creado correctamente.');
          const targetPage = this.editingUserId ? this.currentPage : 1;
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

  viewUserDetail(userId: string): void {
    this.detailError = null;
    this.selectedUserDetail = null;
    this.isDetailLoading = true;
    this.showUserDetailModal = true;

    this.usersApi
      .getUserById(userId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.selectedUserDetail = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  closeUserDetailModal(): void {
    this.showUserDetailModal = false;
    this.detailError = null;
    this.selectedUserDetail = null;
  }

  disableUser(user: UserListItemResponse): void {
    if (!this.canDisable()) {
      return;
    }

    if (!user.isActive) {
      return;
    }

    this.disableError = null;
    this.pendingDisableUser = user;
    this.showDisableConfirmModal = true;
  }

  cancelDisableUser(): void {
    this.showDisableConfirmModal = false;
    this.pendingDisableUser = null;
    this.disableError = null;
  }

  confirmDisableUser(): void {
    if (!this.pendingDisableUser) {
      return;
    }

    const user = this.pendingDisableUser;
    this.isSubmitting = true;
    this.usersApi
      .disableUser(user.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          this.feedback.showSuccess('Usuario deshabilitado correctamente.');
          this.cancelDisableUser();
          this.reloadAfterMutation({
            page: this.currentPage,
            userId: this.selectedUserDetail?.id === user.id ? user.id : undefined
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.disableError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showWarning(`Conflicto al deshabilitar usuario: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  fullName(user: { firstName?: string | null; lastName?: string | null }): string {
    const first = user.firstName?.trim() ?? '';
    const last = user.lastName?.trim() ?? '';
    const combined = `${first} ${last}`.trim();
    return combined.length > 0 ? combined : '-';
  }

  statusClass(isActive: boolean): string {
    return isActive ? 'status-badge approved' : 'status-badge blocked';
  }

  roleNamesFromUser(user: { roles?: ReadonlyArray<{ name: string }> | null }): string {
    const roles = user.roles ?? [];
    if (roles.length === 0) {
      return '-';
    }
    return roles.map((role) => role.name).join(', ');
  }

  userDisplayName(user: Pick<UserListItemResponse, 'userName' | 'email' | 'firstName' | 'lastName'>): string {
    const full = this.fullName(user);
    if (full !== '-') {
      return full;
    }
    return user.userName?.trim() || user.email?.trim() || 'Usuario';
  }

  private reloadAfterMutation(options: { page: number; userId?: string }): void {
    this.loadUsers(options.page);
    if (options.userId) {
      this.viewUserDetail(options.userId);
    }
  }

  protected loadUsers(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetUsersQuery = {
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      search: this.cleanString(this.filterForm.controls.search.value)
    };

    this.usersApi
      .getUsers(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<UserListItemResponse>) => {
          this.users = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadRoleOptions(): void {
    if (!this.canViewRoles()) {
      this.roleOptions = [];
      return;
    }

    this.isLookupLoading = true;
    this.rolesApi
      .getRoles({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        search: null
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLookupLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.roleOptions = response.items;
        },
        error: () => {
          this.roleOptions = [];
        }
      });
  }

  private fillForm(user: UserDetailResponse): void {
    this.userForm.reset({
      email: user.email?.trim() ?? '',
      firstName: user.firstName?.trim() ?? '',
      lastName: user.lastName?.trim() ?? '',
      password: '',
      newPassword: '',
      isActive: user.isActive,
      roleIds: (user.roles ?? []).map((role) => role.id)
    });
  }

  private toCreatePayload(): CreateUserRequest {
    const raw = this.userForm.getRawValue();
    return {
      email: raw.email.trim(),
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      password: raw.password.trim(),
      roleIds: this.selectedRoleIds(),
      isActive: raw.isActive
    };
  }

  private toUpdatePayload(): UpdateUserRequest {
    const raw = this.userForm.getRawValue();
    const trimmedNewPassword = raw.newPassword.trim();
    return {
      email: raw.email.trim(),
      firstName: raw.firstName.trim(),
      lastName: raw.lastName.trim(),
      roleIds: this.selectedRoleIds(),
      isActive: raw.isActive,
      newPassword: trimmedNewPassword.length > 0 ? trimmedNewPassword : null
    };
  }

  private selectedRoleIds(): ReadonlyArray<string> {
    return this.userForm.controls.roleIds.value.filter((id) => typeof id === 'string' && id.trim().length > 0);
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
