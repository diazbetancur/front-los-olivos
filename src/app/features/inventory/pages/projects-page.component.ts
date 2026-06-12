import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  ViewRef,
  computed,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import {
  CreateProjectRequest,
  GetProjectsQuery,
  PagedResult,
  ProjectDetailResponse,
  ProjectListItemResponse,
  ProjectStatus,
  UpdateProjectRequest,
} from '../models/inventory.models';
import { InventoryApiService } from '../services/inventory-api.service';

@Component({
  selector: 'app-projects-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent,
  ],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
})
export class ProjectsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly inventoryApi = inject(InventoryApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canCreate = computed(() => this.authSession.hasPermission('Projects.Create'));
  readonly canUpdate = computed(() => this.authSession.hasPermission('Projects.Update'));
  readonly canDisable = computed(() => this.authSession.hasPermission('Projects.Disable'));

  readonly statuses: ReadonlyArray<ProjectStatus> = ['Activo', 'Inactivo'];

  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(256)]],
    status: [''],
    pageSize: [20, [Validators.min(1), Validators.max(100)]],
  });

  readonly projectForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(256)]],
    department: ['', [Validators.required, Validators.maxLength(128)]],
    municipality: ['', [Validators.required, Validators.maxLength(128)]],
    locationReference: ['', [Validators.required, Validators.maxLength(512)]],
    cadastralKey: ['', [Validators.maxLength(128)]],
    totalAreaM2: [0, [Validators.min(0)]],
    status: ['Activo', [Validators.required, Validators.maxLength(32)]],
  });

  projects: ReadonlyArray<ProjectListItemResponse> = [];
  currentPage = 1;
  totalCount = 0;
  isLoading = false;
  isSubmitting = false;
  showForm = false;
  editingProjectId: string | null = null;
  projectFormSubmitted = false;
  listError: string | null = null;
  formError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  ngOnInit(): void {
    this.loadProjects(1);
  }

  applyFilters(): void {
    this.loadProjects(1);
  }

  clearFilters(): void {
    this.filterForm.patchValue({
      search: '',
      status: '',
      pageSize: 20,
    });
    this.loadProjects(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadProjects(1);
  }

  openCreateForm(): void {
    this.editingProjectId = null;
    this.formError = null;
    this.projectFormSubmitted = false;
    this.showForm = true;
    this.projectForm.reset({
      name: '',
      department: '',
      municipality: '',
      locationReference: '',
      cadastralKey: '',
      totalAreaM2: 0,
      status: 'Activo',
    });
  }

  openEditForm(projectId: string): void {
    this.editingProjectId = projectId;
    this.formError = null;
    this.projectFormSubmitted = false;
    this.showForm = true;
    this.isSubmitting = true;

    this.inventoryApi
      .getProjectById(projectId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        }),
      )
      .subscribe({
        next: (project) => {
          this.fillForm(project);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        },
      });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingProjectId = null;
    this.projectFormSubmitted = false;
    this.formError = null;
  }

  submitProject(): void {
    this.projectFormSubmitted = true;
    this.formError = null;
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    const payload = this.toProjectPayload();
    this.isSubmitting = true;

    const request$ = this.editingProjectId
      ? this.inventoryApi.updateProject(this.editingProjectId, payload)
      : this.inventoryApi.createProject(payload);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        }),
      )
      .subscribe({
        next: () => {
          const targetPage = this.editingProjectId ? this.currentPage : 1;
          this.feedback.show({
            level: 'success',
            text: this.editingProjectId
              ? 'Proyecto actualizado correctamente.'
              : 'Proyecto creado correctamente.',
          });
          this.cancelForm();
          this.reloadAfterMutation(targetPage);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        },
      });
  }

  disableProject(project: ProjectListItemResponse): void {
    if (!this.canDisable()) {
      return;
    }

    const confirmed = globalThis.confirm(
      `Se deshabilitara el proyecto "${project.name}". Deseas continuar?`,
    );
    if (!confirmed) {
      return;
    }

    this.isSubmitting = true;
    this.inventoryApi
      .disableProject(project.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        }),
      )
      .subscribe({
        next: () => {
          this.feedback.show({ level: 'success', text: 'Proyecto deshabilitado correctamente.' });
          this.reloadAfterMutation(this.currentPage);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.feedback.showError(normalizedError.userMessage);
        },
      });
  }

  hasControlError(controlName: string): boolean {
    const control = this.projectForm.get(controlName);
    return !!control && control.invalid && control.touched;
  }

  getControlErrorMessage(controlName: string): string {
    const control = this.projectForm.get(controlName);
    if (!control?.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return 'Este campo es obligatorio.';
    }

    if (control.errors['min']) {
      return 'Ingresa un valor mayor que 0.';
    }

    if (control.errors['maxlength']) {
      return 'Supera la longitud permitida.';
    }

    return 'Valor invalido.';
  }

  private reloadAfterMutation(targetPage: number): void {
    this.loadProjects(targetPage);
  }

  protected loadProjects(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetProjectsQuery = {
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      search: this.cleanString(this.filterForm.controls.search.value),
      status: this.cleanString(this.filterForm.controls.status.value),
    };

    this.inventoryApi
      .getProjects(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        }),
      )
      .subscribe({
        next: (response: PagedResult<ProjectListItemResponse>) => {
          this.projects = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        },
      });
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }

  private fillForm(project: ProjectDetailResponse): void {
    this.projectForm.reset({
      name: project.name,
      department: project.department,
      municipality: project.municipality,
      locationReference: project.locationReference,
      cadastralKey: project.cadastralKey ?? '',
      totalAreaM2: project.totalAreaM2 ?? 0,
      status: project.status as ProjectStatus,
    });
  }

  private toProjectPayload(): CreateProjectRequest | UpdateProjectRequest {
    const raw = this.projectForm.getRawValue();
    return {
      name: raw.name.trim(),
      department: raw.department.trim(),
      municipality: raw.municipality.trim(),
      locationReference: raw.locationReference.trim(),
      cadastralKey: this.cleanString(raw.cadastralKey),
      totalAreaM2: raw.totalAreaM2 > 0 ? Number(raw.totalAreaM2) : null,
      status: raw.status.trim(),
    };
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }
}
