import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
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
  ChangeLotStatusRequest,
  CreateLotRequest,
  GetLotsQuery,
  LotDetailResponse,
  LotImportConfirmResponse,
  LotImportPreviewResponse,
  LotListItemResponse,
  LotStatus,
  PagedResult,
  ProjectListItemResponse,
  UpdateLotRequest
} from '../models/inventory.models';
import { InventoryApiService } from '../services/inventory-api.service';

type LotStatusAction = 'reserve' | 'release' | 'block' | 'unblock' | 'cancel';
const LOOKUP_PAGE_SIZE = 100;

@Component({
  selector: 'app-lots-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent
  ],
  templateUrl: './lots-page.component.html',
  styleUrl: './lots-page.component.scss'
})
export class LotsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly inventoryApi = inject(InventoryApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canCreate = computed(() => this.authSession.hasPermission('Lots.Create'));
  readonly canUpdate = computed(() => this.authSession.hasPermission('Lots.Update'));
  readonly canChangeStatus = computed(() => this.authSession.hasPermission('Lots.ChangeStatus'));
  readonly canImport = computed(() => this.authSession.hasPermission('Lots.Import'));

  readonly lotStatuses: ReadonlyArray<LotStatus> = [
    'Disponible',
    'Reservado',
    'Contratado',
    'Pagado',
    'Bloqueado',
    'Anulado'
  ];

  readonly filterForm = this.formBuilder.nonNullable.group({
    projectId: [''],
    blockId: [''],
    status: [''],
    search: ['', [Validators.maxLength(256)]],
    minArea: [''],
    maxArea: [''],
    minPrice: [''],
    maxPrice: [''],
    pageSize: [20, [Validators.min(1), Validators.max(100)]]
  });

  readonly lotForm = this.formBuilder.nonNullable.group({
    projectId: ['', [Validators.required]],
    blockId: [''],
    code: ['', [Validators.required, Validators.maxLength(64)]],
    fullCode: ['', [Validators.required, Validators.maxLength(128)]],
    number: ['', [Validators.required, Validators.maxLength(64)]],
    areaM2: [0, [Validators.required, Validators.min(0.000001)]],
    areaV2: [''],
    northMeasure: [''],
    northBoundary: ['', [Validators.maxLength(256)]],
    southMeasure: [''],
    southBoundary: ['', [Validators.maxLength(256)]],
    eastMeasure: [''],
    eastBoundary: ['', [Validators.maxLength(256)]],
    westMeasure: [''],
    westBoundary: ['', [Validators.maxLength(256)]],
    listPrice: [0, [Validators.required, Validators.min(0)]],
    currency: ['HNL', [Validators.maxLength(16)]],
    status: ['Disponible', [Validators.maxLength(32)]],
    intendedUse: ['', [Validators.maxLength(128)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  readonly importForm = this.formBuilder.nonNullable.group({
    projectId: ['', [Validators.required]]
  });

  lots: ReadonlyArray<LotListItemResponse> = [];
  projectOptions: ReadonlyArray<ProjectListItemResponse> = [];
  selectedLotDetail: LotDetailResponse | null = null;
  importPreview: LotImportPreviewResponse | null = null;
  importConfirmResult: LotImportConfirmResponse | null = null;
  selectedImportFile: File | null = null;

  currentPage = 1;
  totalCount = 0;
  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isPreviewLoading = false;
  isConfirmLoading = false;
  showForm = false;
  editingLotId: string | null = null;
  lotFormSubmitted = false;
  listError: string | null = null;
  formError: string | null = null;
  detailError: string | null = null;
  importError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  get hasProjectSelected(): boolean {
    return !!this.filterForm.controls.projectId.value;
  }

  ngOnInit(): void {
    this.loadProjectOptions();
  }

  onProjectChange(): void {
    if (this.hasProjectSelected) {
      this.loadLots(1);
    } else {
      this.lots = [];
      this.totalCount = 0;
      this.currentPage = 1;
      this.syncView();
    }
  }

  applyFilters(): void {
    if (!this.hasProjectSelected) {
      return;
    }
    this.loadLots(1);
  }

  clearFilters(): void {
    const projectId = this.filterForm.controls.projectId.value;
    this.filterForm.reset({
      projectId,
      blockId: '',
      status: '',
      search: '',
      minArea: '',
      maxArea: '',
      minPrice: '',
      maxPrice: '',
      pageSize: 20
    });
    if (projectId) {
      this.loadLots(1);
    } else {
      this.lots = [];
      this.totalCount = 0;
      this.currentPage = 1;
      this.syncView();
    }
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadLots(1);
  }

  openCreateForm(): void {
    this.editingLotId = null;
    this.formError = null;
    this.lotFormSubmitted = false;
    this.showForm = true;
    this.lotForm.reset({
      projectId: this.filterForm.controls.projectId.value || this.projectOptions[0]?.id || '',
      blockId: '',
      code: '',
      fullCode: '',
      number: '',
      areaM2: 0,
      areaV2: '',
      northMeasure: '',
      northBoundary: '',
      southMeasure: '',
      southBoundary: '',
      eastMeasure: '',
      eastBoundary: '',
      westMeasure: '',
      westBoundary: '',
      listPrice: 0,
      currency: 'HNL',
      status: 'Disponible',
      intendedUse: '',
      notes: ''
    });
  }

  openEditForm(lotId: string): void {
    this.editingLotId = lotId;
    this.formError = null;
    this.lotFormSubmitted = false;
    this.showForm = true;
    this.isSubmitting = true;

    this.inventoryApi
      .getLotById(lotId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (lotDetail) => {
          this.fillLotForm(lotDetail);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        }
      });
  }

  viewLotDetail(lotId: string): void {
    this.selectedLotDetail = null;
    this.detailError = null;
    this.isDetailLoading = true;

    this.inventoryApi
      .getLotById(lotId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (lotDetail) => {
          this.selectedLotDetail = lotDetail;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
        }
      });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingLotId = null;
    this.lotFormSubmitted = false;
    this.formError = null;
  }

  submitLot(): void {
    this.lotFormSubmitted = true;
    this.formError = null;
    if (this.lotForm.invalid) {
      this.lotForm.markAllAsTouched();
      return;
    }

    const createPayload = this.toCreateLotPayload();
    const updatePayload = this.toUpdateLotPayload();
    this.isSubmitting = true;

    const request$ = this.editingLotId
      ? this.inventoryApi.updateLot(this.editingLotId, updatePayload)
      : this.inventoryApi.createLot(createPayload);

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
          const targetPage = this.editingLotId ? this.currentPage : 1;
          this.feedback.show({
            level: 'success',
            text: this.editingLotId
              ? 'Lote actualizado correctamente.'
              : 'Lote creado correctamente.'
          });

          this.cancelForm();
          this.reloadAfterMutation({
            page: targetPage,
            lotId: response.id
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        }
      });
  }

  changeLotStatus(lot: LotListItemResponse, action: LotStatusAction): void {
    if (!this.canChangeStatus()) {
      return;
    }

    const actionLabel = this.getActionLabel(action);
    const notes = globalThis.prompt(`Ingresa una nota opcional para la accion "${actionLabel}"`, '') ?? '';
    const confirmed = globalThis.confirm(`Se ejecutara la accion "${actionLabel}" sobre lote ${lot.fullCode}. Continuar?`);
    if (!confirmed) {
      return;
    }

    const request: ChangeLotStatusRequest = { notes: this.cleanString(notes) };
    const operation$ = this.getStatusOperation(lot.id, action, request);
    this.isSubmitting = true;

    operation$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({
            level: 'success',
            text: `Accion "${actionLabel}" aplicada correctamente.`
          });
          this.reloadAfterMutation({
            page: this.currentPage,
            lotId: response.id
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al cambiar estado: ${normalizedError.userMessage}`);
            return;
          }

          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  canRunAction(status: string, action: LotStatusAction): boolean {
    switch (action) {
      case 'reserve':
        return status === 'Disponible';
      case 'release':
        return status === 'Reservado';
      case 'block':
        return status === 'Disponible' || status === 'Reservado';
      case 'unblock':
        return status === 'Bloqueado';
      case 'cancel':
        return status !== 'Contratado' && status !== 'Pagado' && status !== 'Anulado';
      default:
        return false;
    }
  }

  resolveProjectLabel(projectId: string): string {
    const option = this.projectOptions.find((project) => project.id === projectId);
    if (!option) {
      return projectId;
    }

    return `${option.code} - ${option.name}`;
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedImportFile = file;
    this.importPreview = null;
    this.importConfirmResult = null;
    this.importError = null;
  }

  previewImport(): void {
    this.importError = null;
    this.importConfirmResult = null;
    if (this.importForm.invalid) {
      this.importForm.markAllAsTouched();
      return;
    }

    if (!this.selectedImportFile) {
      this.importError = 'Selecciona un archivo Excel para generar el preview.';
      return;
    }

    const projectId = this.importForm.controls.projectId.value;
    this.isPreviewLoading = true;

    this.inventoryApi
      .previewLotImport(projectId, this.selectedImportFile)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isPreviewLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.importPreview = response;
          this.feedback.show({
            level: 'info',
            text: `Preview listo. Filas validas: ${response.validRows} / ${response.totalRows}.`
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.importError = normalizedError.userMessage;
        }
      });
  }

  confirmImport(): void {
    this.importError = null;
    if (!this.importPreview) {
      this.importError = 'Genera un preview antes de confirmar.';
      return;
    }

    this.isConfirmLoading = true;
    this.inventoryApi
      .confirmLotImport({ previewId: this.importPreview.previewId })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isConfirmLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.importConfirmResult = response;
          if (response.isSuccess) {
            this.feedback.show({
              level: 'success',
              text: `Importacion completada. Filas persistidas: ${response.persistedRows}.`
            });
            this.reloadAfterMutation({
              page: 1,
              refreshLookups: true
            });
          } else {
            this.feedback.showError('La importacion reporto conflictos en algunas filas.');
          }
        },
        error: (error: unknown) => {
          if (error instanceof HttpErrorResponse && error.status === 409 && error.error) {
            this.importConfirmResult = error.error as LotImportConfirmResponse;
            this.feedback.showError('La confirmacion detecto conflictos y no persistio filas.');
            return;
          }

          const normalizedError = this.apiErrorService.normalize(error);
          this.importError = normalizedError.userMessage;
        }
      });
  }

  private reloadAfterMutation(options: { page: number; lotId?: string; refreshLookups?: boolean }): void {
    if (options.refreshLookups) {
      this.loadProjectOptions();
    }

    this.loadLots(options.page);
    if (options.lotId) {
      this.viewLotDetail(options.lotId);
    }
  }

  protected loadLots(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetLotsQuery = {
      projectId: this.cleanString(this.filterForm.controls.projectId.value),
      blockId: this.cleanString(this.filterForm.controls.blockId.value),
      status: this.cleanString(this.filterForm.controls.status.value),
      search: this.cleanString(this.filterForm.controls.search.value),
      minArea: this.toNullableNumber(this.filterForm.controls.minArea.value),
      maxArea: this.toNullableNumber(this.filterForm.controls.maxArea.value),
      minPrice: this.toNullableNumber(this.filterForm.controls.minPrice.value),
      maxPrice: this.toNullableNumber(this.filterForm.controls.maxPrice.value),
      page,
      pageSize: this.filterForm.controls.pageSize.value
    };

    this.inventoryApi
      .getLots(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<LotListItemResponse>) => {
          this.lots = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadProjectOptions(): void {
    this.inventoryApi
      .getProjects({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        search: null,
        status: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.projectOptions = response.items;
          if (!this.importForm.controls.projectId.value && response.items.length > 0) {
            this.importForm.patchValue({ projectId: response.items[0].id });
          }
          this.syncView();
        },
        error: () => {
          this.projectOptions = [];
          this.syncView();
        }
      });
  }

  private fillLotForm(lotDetail: LotDetailResponse): void {
    this.lotForm.reset({
      projectId: lotDetail.projectId,
      blockId: lotDetail.blockId ?? '',
      code: lotDetail.code,
      fullCode: lotDetail.fullCode,
      number: lotDetail.number,
      areaM2: lotDetail.areaM2,
      areaV2: lotDetail.areaV2?.toString() ?? '',
      northMeasure: lotDetail.northMeasure?.toString() ?? '',
      northBoundary: lotDetail.northBoundary,
      southMeasure: lotDetail.southMeasure?.toString() ?? '',
      southBoundary: lotDetail.southBoundary,
      eastMeasure: lotDetail.eastMeasure?.toString() ?? '',
      eastBoundary: lotDetail.eastBoundary,
      westMeasure: lotDetail.westMeasure?.toString() ?? '',
      westBoundary: lotDetail.westBoundary,
      listPrice: lotDetail.listPrice,
      currency: lotDetail.currency,
      status: lotDetail.status,
      intendedUse: lotDetail.intendedUse,
      notes: lotDetail.notes ?? ''
    });
  }

  private toCreateLotPayload(): CreateLotRequest {
    const raw = this.lotForm.getRawValue();
    return {
      projectId: raw.projectId.trim(),
      blockId: this.cleanString(raw.blockId),
      code: raw.code.trim(),
      fullCode: raw.fullCode.trim(),
      number: raw.number.trim(),
      areaM2: Number(raw.areaM2),
      areaV2: this.toNullableNumber(raw.areaV2),
      northMeasure: this.toNullableNumber(raw.northMeasure),
      northBoundary: raw.northBoundary.trim(),
      southMeasure: this.toNullableNumber(raw.southMeasure),
      southBoundary: raw.southBoundary.trim(),
      eastMeasure: this.toNullableNumber(raw.eastMeasure),
      eastBoundary: raw.eastBoundary.trim(),
      westMeasure: this.toNullableNumber(raw.westMeasure),
      westBoundary: raw.westBoundary.trim(),
      listPrice: Number(raw.listPrice),
      currency: this.cleanString(raw.currency) ?? 'HNL',
      status: this.cleanString(raw.status) ?? 'Disponible',
      intendedUse: raw.intendedUse.trim(),
      notes: this.cleanString(raw.notes)
    };
  }

  private toUpdateLotPayload(): UpdateLotRequest {
    const raw = this.lotForm.getRawValue();
    return {
      projectId: raw.projectId.trim(),
      blockId: this.cleanString(raw.blockId),
      code: raw.code.trim(),
      fullCode: raw.fullCode.trim(),
      number: raw.number.trim(),
      areaM2: Number(raw.areaM2),
      areaV2: this.toNullableNumber(raw.areaV2),
      northMeasure: this.toNullableNumber(raw.northMeasure),
      northBoundary: raw.northBoundary.trim(),
      southMeasure: this.toNullableNumber(raw.southMeasure),
      southBoundary: raw.southBoundary.trim(),
      eastMeasure: this.toNullableNumber(raw.eastMeasure),
      eastBoundary: raw.eastBoundary.trim(),
      westMeasure: this.toNullableNumber(raw.westMeasure),
      westBoundary: raw.westBoundary.trim(),
      listPrice: Number(raw.listPrice),
      currency: this.cleanString(raw.currency) ?? 'HNL',
      intendedUse: raw.intendedUse.trim(),
      notes: this.cleanString(raw.notes)
    };
  }

  private getStatusOperation(lotId: string, action: LotStatusAction, request: ChangeLotStatusRequest) {
    switch (action) {
      case 'reserve':
        return this.inventoryApi.reserveLot(lotId, request);
      case 'release':
        return this.inventoryApi.releaseLot(lotId, request);
      case 'block':
        return this.inventoryApi.blockLot(lotId, request);
      case 'unblock':
        return this.inventoryApi.unblockLot(lotId, request);
      case 'cancel':
        return this.inventoryApi.cancelLot(lotId, request);
      default:
        return this.inventoryApi.reserveLot(lotId, request);
    }
  }

  private getActionLabel(action: LotStatusAction): string {
    switch (action) {
      case 'reserve':
        return 'Reservar';
      case 'release':
        return 'Liberar';
      case 'block':
        return 'Bloquear';
      case 'unblock':
        return 'Desbloquear';
      case 'cancel':
        return 'Anular';
      default:
        return action;
    }
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  private toNullableNumber(value: string | number | null | undefined): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
