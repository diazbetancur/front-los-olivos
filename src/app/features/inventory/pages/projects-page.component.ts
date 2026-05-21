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
import {
  CreateProjectRequest,
  GetProjectsQuery,
  PagedResult,
  ProjectDetailResponse,
  ProjectListItemResponse,
  ProjectStatus,
  UpdateProjectRequest
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
    HasPermissionDirective
  ],
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss'
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
    pageSize: [20, [Validators.min(1), Validators.max(100)]]
  });

  readonly projectForm = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(64)]],
    name: ['', [Validators.required, Validators.maxLength(256)]],
    description: ['', [Validators.required, Validators.maxLength(1024)]],
    department: ['', [Validators.required, Validators.maxLength(128)]],
    municipality: ['', [Validators.required, Validators.maxLength(128)]],
    locationReference: ['', [Validators.required, Validators.maxLength(512)]],
    cadastralKey: ['', [Validators.required, Validators.maxLength(128)]],
    totalAreaM2: [0, [Validators.required, Validators.min(0.000001)]],
    status: ['Activo', [Validators.required, Validators.maxLength(32)]],
    notes: ['', [Validators.maxLength(2048)]]
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
      pageSize: 20
    });
    this.loadProjects(1);
  }

  goToPreviousPage(): void {
    if (this.currentPage <= 1) {
      return;
    }

    this.loadProjects(this.currentPage - 1);
  }

  goToNextPage(): void {
    if (this.currentPage >= this.totalPages()) {
      return;
    }

    this.loadProjects(this.currentPage + 1);
  }

  openCreateForm(): void {
    this.editingProjectId = null;
    this.formError = null;
    this.projectFormSubmitted = false;
    this.showForm = true;
    this.projectForm.reset({
      code: '',
      name: '',
      description: '',
      department: '',
      municipality: '',
      locationReference: '',
      cadastralKey: '',
      totalAreaM2: 0,
      status: 'Activo',
      notes: ''
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
        })
      )
      .subscribe({
        next: (project) => {
          this.fillForm(project);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        }
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
      ? this.inventoryApi.updateProject(this.editingProjectId, payload as UpdateProjectRequest)
      : this.inventoryApi.createProject(payload as CreateProjectRequest);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          const targetPage = this.editingProjectId ? this.currentPage : 1;
          this.feedback.show({
            level: 'success',
            text: this.editingProjectId
              ? 'Proyecto actualizado correctamente.'
              : 'Proyecto creado correctamente.'
          });
          this.cancelForm();
          this.reloadAfterMutation(targetPage);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        }
      });
  }

  disableProject(project: ProjectListItemResponse): void {
    if (!this.canDisable()) {
      return;
    }

    const confirmed = globalThis.confirm(`Se deshabilitara el proyecto "${project.name}". Deseas continuar?`);
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
        })
      )
      .subscribe({
        next: () => {
          this.feedback.show({ level: 'success', text: 'Proyecto deshabilitado correctamente.' });
          this.reloadAfterMutation(this.currentPage);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  private reloadAfterMutation(targetPage: number): void {
    this.loadProjects(targetPage);
  }

  private loadProjects(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetProjectsQuery = {
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      search: this.cleanString(this.filterForm.controls.search.value),
      status: this.cleanString(this.filterForm.controls.status.value)
    };

    this.inventoryApi
      .getProjects(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
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
        }
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
      code: project.code,
      name: project.name,
      description: project.description,
      department: project.department,
      municipality: project.municipality,
      locationReference: project.locationReference,
      cadastralKey: project.cadastralKey,
      totalAreaM2: project.totalAreaM2,
      status: project.status as ProjectStatus,
      notes: project.notes ?? ''
    });
  }

  private toProjectPayload(): CreateProjectRequest | UpdateProjectRequest {
    const raw = this.projectForm.getRawValue();
    return {
      code: raw.code.trim(),
      name: raw.name.trim(),
      description: raw.description.trim(),
      department: raw.department.trim(),
      municipality: raw.municipality.trim(),
      locationReference: raw.locationReference.trim(),
      cadastralKey: raw.cadastralKey.trim(),
      totalAreaM2: Number(raw.totalAreaM2),
      status: raw.status.trim(),
      notes: this.cleanString(raw.notes)
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
