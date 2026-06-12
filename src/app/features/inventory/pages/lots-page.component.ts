import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnInit,
  ViewRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, fromEvent } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
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
  UpdateLotRequest,
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
    PaginationComponent,
  ],
  templateUrl: './lots-page.component.html',
  styleUrl: './lots-page.component.scss',
})
export class LotsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly inventoryApi = inject(InventoryApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly activeTab = signal<'lots' | 'import'>('lots');
  readonly openActionsLotId = signal<string | null>(null);
  readonly actionsMenuPosition = signal<{ top: number; right: number } | null>(null);

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
    'Anulado',
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
    pageSize: [20, [Validators.min(1), Validators.max(100)]],
  });

  readonly lotForm = this.formBuilder.nonNullable.group({
    projectId: ['', [Validators.required]],
    blockId: [''],
    code: ['', [Validators.required, Validators.maxLength(64)]],
    fullCode: ['', [Validators.required, Validators.maxLength(128)]],
    areaM2: [0, [Validators.required, Validators.min(0.000001)]],
    areaVr2: [null as number | null, [Validators.min(0)]],
    northMeasure: ['', [Validators.min(0)]],
    northBoundary: ['', [Validators.maxLength(256)]],
    southMeasure: ['', [Validators.min(0)]],
    southBoundary: ['', [Validators.maxLength(256)]],
    eastMeasure: ['', [Validators.min(0)]],
    eastBoundary: ['', [Validators.maxLength(256)]],
    westMeasure: ['', [Validators.min(0)]],
    westBoundary: ['', [Validators.maxLength(256)]],
    listPrice: [0, [Validators.required, Validators.min(0)]],
    currency: ['HNL', [Validators.maxLength(16)]],
    status: ['Disponible', [Validators.maxLength(32)]],
    notes: ['', [Validators.maxLength(2048)]],
  });

  lots: ReadonlyArray<LotListItemResponse> = [];
  projectOptions: ReadonlyArray<ProjectListItemResponse> = [];
  readonly selectedLotDetail = signal<LotDetailResponse | null>(null);
  importPreview: LotImportPreviewResponse | null = null;
  importConfirmResult: LotImportConfirmResponse | null = null;
  selectedImportFile: File | null = null;

  currentPage = 1;
  totalCount = 0;
  isLoading = false;
  isSubmitting = false;
  readonly isDetailLoading = signal(false);
  isPreviewLoading = false;
  isConfirmLoading = false;
  showForm = false;
  readonly showDetailModal = signal(false);
  editingLotId: string | null = null;
  listError: string | null = null;
  formError: string | null = null;
  readonly detailError = signal<string | null>(null);
  importError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  setTab(tab: 'lots' | 'import'): void {
    this.activeTab.set(tab);
  }

  get hasProjectSelected(): boolean {
    return !!this.filterForm.controls.projectId.value;
  }

  get selectedFormProjectLabel(): string {
    const projectId =
      this.lotForm.controls.projectId.value || this.filterForm.controls.projectId.value;
    return projectId ? this.resolveProjectLabel(projectId) : 'Sin proyecto seleccionado';
  }

  ngOnInit(): void {
    this.loadProjectOptions();
    fromEvent(document, 'click')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.openActionsLotId() !== null) {
          this.openActionsLotId.set(null);
          this.actionsMenuPosition.set(null);
          this.syncView();
        }
      });
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
      pageSize: 20,
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
    const projectId = this.filterForm.controls.projectId.value;
    if (!projectId) {
      this.feedback.showError('Selecciona un proyecto antes de crear un lote.');
      return;
    }

    this.editingLotId = null;
    this.formError = null;
    this.showForm = true;
    this.lotForm.reset({
      projectId,
      blockId: '',
      code: '',
      fullCode: '',
      areaM2: 0,
      areaVr2: null,
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
      notes: '',
    });
  }

  openEditForm(lotId: string): void {
    this.editingLotId = lotId;
    this.formError = null;
    this.showForm = true;
    this.isSubmitting = true;

    this.inventoryApi
      .getLotById(lotId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        }),
      )
      .subscribe({
        next: (lotDetail) => {
          this.fillLotForm(lotDetail);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        },
      });
  }

  viewLotDetail(lotId: string): void {
    this.selectedLotDetail.set(null);
    this.detailError.set(null);
    this.isDetailLoading.set(true);
    this.showDetailModal.set(true);

    this.inventoryApi
      .getLotById(lotId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lotDetail) => {
          this.selectedLotDetail.set(lotDetail);
          this.isDetailLoading.set(false);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError.set(normalizedError.userMessage);
          this.isDetailLoading.set(false);
        },
      });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingLotId = null;
    this.formError = null;
  }

  closeDetail(): void {
    this.showDetailModal.set(false);
    this.selectedLotDetail.set(null);
    this.detailError.set(null);
  }

  toggleActionsMenu(lotId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openActionsLotId() === lotId) {
      this.openActionsLotId.set(null);
      this.actionsMenuPosition.set(null);
      return;
    }
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 185;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight - 4 : rect.bottom + 4;
    this.actionsMenuPosition.set({ top, right: window.innerWidth - rect.right });
    this.openActionsLotId.set(lotId);
  }

  submitLot(): void {
    this.formError = null;
    if (this.lotForm.invalid) {
      this.lotForm.markAllAsTouched();
      if (this.lotForm.controls.projectId.invalid) {
        this.formError = 'Selecciona un proyecto antes de guardar el lote.';
      }
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
        }),
      )
      .subscribe({
        next: (response) => {
          const targetPage = this.editingLotId ? this.currentPage : 1;
          this.feedback.show({
            level: 'success',
            text: this.editingLotId
              ? 'Lote actualizado correctamente.'
              : 'Lote creado correctamente.',
          });

          this.cancelForm();
          this.reloadAfterMutation({
            page: targetPage,
            lotId: response.id,
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.formError = normalizedError.userMessage;
        },
      });
  }

  changeLotStatus(lot: LotListItemResponse, action: LotStatusAction): void {
    this.openActionsLotId.set(null);
    this.actionsMenuPosition.set(null);
    if (!this.canChangeStatus()) {
      return;
    }

    const actionLabel = this.getActionLabel(action);
    const notes =
      globalThis.prompt(`Ingresa una nota opcional para la accion "${actionLabel}"`, '') ?? '';
    const confirmed = globalThis.confirm(
      `Se ejecutara la accion "${actionLabel}" sobre lote ${lot.fullCode}. Continuar?`,
    );
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
        }),
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({
            level: 'success',
            text: `Accion "${actionLabel}" aplicada correctamente.`,
          });
          this.reloadAfterMutation({
            page: this.currentPage,
            lotId: response.id,
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al cambiar estado: ${normalizedError.userMessage}`);
            return;
          }

          this.feedback.showError(normalizedError.userMessage);
        },
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

    return option.name;
  }

  hasControlError(controlName: string): boolean {
    const control = this.lotForm.get(controlName);
    return !!control && control.invalid && control.touched;
  }

  getControlErrorMessage(controlName: string): string {
    const control = this.lotForm.get(controlName);
    if (!control?.errors || !control.touched) {
      return '';
    }

    if (control.errors['required']) {
      return 'Este campo es obligatorio.';
    }

    if (control.errors['min']) {
      return control.errors['min'].min === 0
        ? 'Ingresa un valor igual o mayor que 0.'
        : 'Ingresa un valor mayor que 0.';
    }

    if (control.errors['maxlength']) {
      return 'Supera la longitud permitida.';
    }

    return 'Valor invalido.';
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

    const projectId = this.filterForm.controls.projectId.value;
    if (!projectId) {
      this.importError = 'Selecciona un proyecto en el selector de la cabecera.';
      return;
    }

    if (!this.selectedImportFile) {
      this.importError = 'Selecciona un archivo Excel para generar el preview.';
      return;
    }
    this.isPreviewLoading = true;

    this.inventoryApi
      .previewLotImport(projectId, this.selectedImportFile)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isPreviewLoading = false;
          this.syncView();
        }),
      )
      .subscribe({
        next: (response) => {
          this.importPreview = response;
          this.feedback.show({
            level: 'info',
            text: `Preview listo. Filas validas: ${response.validRows} / ${response.totalRows}.`,
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.importError = normalizedError.userMessage;
        },
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
        }),
      )
      .subscribe({
        next: (response) => {
          this.importConfirmResult = response;
          if (response.isSuccess) {
            this.feedback.show({
              level: 'success',
              text: `Importacion completada. Filas persistidas: ${response.persistedRows}.`,
            });
            this.reloadAfterMutation({
              page: 1,
              refreshLookups: true,
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
        },
      });
  }

  private reloadAfterMutation(options: {
    page: number;
    lotId?: string;
    refreshLookups?: boolean;
  }): void {
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
      pageSize: this.filterForm.controls.pageSize.value,
    };

    this.inventoryApi
      .getLots(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        }),
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
        },
      });
  }

  private loadProjectOptions(): void {
    this.inventoryApi
      .getProjects({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        search: null,
        status: null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.projectOptions = response.items;
          this.syncView();
        },
        error: () => {
          this.projectOptions = [];
          this.syncView();
        },
      });
  }

  private fillLotForm(lotDetail: LotDetailResponse): void {
    this.lotForm.reset({
      projectId: lotDetail.projectId,
      blockId: lotDetail.blockId ?? '',
      code: lotDetail.code,
      fullCode: lotDetail.fullCode,
      areaM2: lotDetail.areaM2,
      areaVr2: lotDetail.areaVr2 ?? null,
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
      notes: lotDetail.notes ?? '',
    });
  }

  private toCreateLotPayload(): CreateLotRequest {
    const raw = this.lotForm.getRawValue();
    return {
      projectId: raw.projectId.trim(),
      blockId: this.cleanString(raw.blockId),
      code: raw.code.trim(),
      fullCode: raw.fullCode.trim(),
      areaM2: Number(raw.areaM2),
      areaVr2: this.toNullableNumber(raw.areaVr2),
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
      notes: this.cleanString(raw.notes),
    };
  }

  private toUpdateLotPayload(): UpdateLotRequest {
    const raw = this.lotForm.getRawValue();
    return {
      projectId: raw.projectId.trim(),
      blockId: this.cleanString(raw.blockId),
      code: raw.code.trim(),
      fullCode: raw.fullCode.trim(),
      areaM2: Number(raw.areaM2),
      areaVr2: this.toNullableNumber(raw.areaVr2),
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
      notes: this.cleanString(raw.notes),
    };
  }

  private getStatusOperation(
    lotId: string,
    action: LotStatusAction,
    request: ChangeLotStatusRequest,
  ) {
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
