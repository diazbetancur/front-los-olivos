import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
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
  CancelContractRequest,
  ClientLookupItem,
  ContractDetailResponse,
  ContractInstallmentResponse,
  ContractListItemResponse,
  ContractStatus,
  CreateContractRequest,
  GeneratedDocumentResponse,
  GetProjectContractsQuery,
  LotLookupItem,
  PagedResult,
  ProjectLookupItem,
  UpdateContractStatusRequest
} from '../models/contracts.models';
import { ContractsApiService } from '../services/contracts-api.service';

const LOOKUP_PAGE_SIZE = 100;

function startDateNotBeforeContractDate(group: AbstractControl): ValidationErrors | null {
  const contractDate = group.get('contractDate')?.value as string;
  const startDate = group.get('startDate')?.value as string;
  if (!contractDate || !startDate) return null;
  return startDate >= contractDate ? null : { startDateBeforeContractDate: true };
}

function downPaymentNotExceedsAmount(group: AbstractControl): ValidationErrors | null {
  const contractAmount = Number(group.get('contractAmount')?.value);
  const downPayment = Number(group.get('downPayment')?.value);
  if (!Number.isFinite(contractAmount) || !Number.isFinite(downPayment)) return null;
  return downPayment <= contractAmount ? null : { downPaymentExceedsAmount: true };
}

@Component({
  selector: 'app-contracts-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent
  ],
  templateUrl: './contracts-page.component.html',
  styleUrl: './contracts-page.component.scss'
})
export class ContractsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly contractsApi = inject(ContractsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canView = computed(() => this.authSession.hasPermission('Contracts.View'));
  readonly canCreate = computed(() => this.authSession.hasPermission('Contracts.Create'));
  readonly canApprove = computed(() => this.authSession.hasPermission('Contracts.Approve'));
  readonly canCancel = computed(() => this.authSession.hasPermission('Contracts.Cancel'));
  readonly canGenerateDocument = computed(() => this.authSession.hasPermission('Contracts.GenerateDocument'));
  readonly canViewSchedule = computed(() => this.authSession.hasPermission('PaymentSchedules.View'));
  readonly canViewDocuments = computed(() => this.authSession.hasPermission('Documents.View'));

  readonly contractStatuses: ReadonlyArray<ContractStatus> = [
    'Borrador',
    'PendienteFirma',
    'Activo',
    'EnMora',
    'Pagado',
    'Cerrado',
    'Rescindido',
    'Anulado'
  ];

  readonly filterForm = this.formBuilder.nonNullable.group({
    projectId: [''],
    status: [''],
    search: ['', [Validators.maxLength(128)]],
    fromDate: [''],
    toDate: [''],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly contractForm = this.formBuilder.nonNullable.group(
    {
      projectId: ['', [Validators.required]],
      lotId: ['', [Validators.required]],
      clientId: ['', [Validators.required]],
      contractDate: [this.todayString(), [Validators.required]],
      startDate: [this.todayString(), [Validators.required]],
      termMonths: [12, [Validators.required, Validators.min(1), Validators.max(600)]],
      contractAmount: [0, [Validators.required, Validators.min(0.01)]],
      downPayment: [0, [Validators.required, Validators.min(0)]],
      monthlyPayment: [0, [Validators.required, Validators.min(0.01)]],
      interestRate: [0, [Validators.required, Validators.min(0)]],
      lateFeeRate: ['0'],
      lateFeeRateEnabled: [false],
      annualTotalCost: [''],
      purchaseOptionValue: [''],
      monthlyPaymentDay: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
      currency: ['HNL', [Validators.maxLength(16)]],
      specialConditionText: ['', [Validators.maxLength(4096)]],
      discountPreparedAmount: [''],
      discountPreparedDeadline: [''],
      discountPreparedEnabled: [false],
      notes: ['', [Validators.maxLength(2048)]]
    },
    { validators: [startDateNotBeforeContractDate, downPaymentNotExceedsAmount] }
  );

  readonly statusForm = this.formBuilder.nonNullable.group({
    status: ['Borrador', [Validators.required, Validators.maxLength(32)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  readonly cancelForm = this.formBuilder.nonNullable.group({
    notes: ['', [Validators.required, Validators.maxLength(2048)]]
  });

  contracts: ReadonlyArray<ContractListItemResponse> = [];
  schedule: ReadonlyArray<ContractInstallmentResponse> = [];
  documents: ReadonlyArray<GeneratedDocumentResponse> = [];
  projectOptions: ReadonlyArray<ProjectLookupItem> = [];
  lotOptions: ReadonlyArray<LotLookupItem> = [];
  createLotOptions: ReadonlyArray<LotLookupItem> = [];
  clientOptions: ReadonlyArray<ClientLookupItem> = [];
  selectedContractDetail: ContractDetailResponse | null = null;

  // Combobox state — create form
  clientSearchInput = '';
  clientDropdownItems: ReadonlyArray<ClientLookupItem> = [];
  showClientDropdown = false;
  projectSearchInput = '';
  projectDropdownItems: ReadonlyArray<ProjectLookupItem> = [];
  showProjectDropdown = false;

  // Combobox state — list project filter (typeahead)
  listProjectSearch = '';
  listProjectDropdownItems: ReadonlyArray<ProjectLookupItem> = [];
  showListProjectDropdown = false;

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isScheduleLoading = false;
  isDocumentsLoading = false;
  isGeneratingDocuments = false;
  isLookupLoading = false;

  readonly detailTab = signal<'info' | 'schedule'>('info');

  showCreateForm = false;
  showStatusForm = false;
  showCancelForm = false;

  createFormSubmitted = false;
  statusFormSubmitted = false;
  cancelFormSubmitted = false;

  listError: string | null = null;
  createFormError: string | null = null;
  detailError: string | null = null;
  scheduleError: string | null = null;
  documentsError: string | null = null;
  statusError: string | null = null;
  cancelError: string | null = null;

  get isClientSelected(): boolean {
    return !!this.contractForm.controls.clientId.value;
  }

  get isProjectSelected(): boolean {
    return !!this.contractForm.controls.projectId.value;
  }

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  hasCreateSelections(): boolean {
    const raw = this.contractForm.getRawValue();
    return !!(raw.projectId?.trim() && raw.lotId?.trim() && raw.clientId?.trim());
  }

  get hasProjectSelected(): boolean {
    return !!this.filterForm.controls.projectId.value;
  }

  ngOnInit(): void {
    this.loadLookupOptions();
    // No se precargan contratos: la lista exige seleccionar un proyecto primero.
  }

  applyFilters(): void {
    this.loadContracts(1);
  }

  clearFilters(): void {
    const projectId = this.filterForm.controls.projectId.value;
    this.filterForm.reset({
      projectId,
      status: '',
      search: '',
      fromDate: '',
      toDate: '',
      pageSize: 20
    });
    if (this.hasProjectSelected) {
      this.loadContracts(1);
    }
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadContracts(1);
  }

  // ── Selector de proyecto de la lista (typeahead) ──────────────────────
  openListProjectDropdown(): void {
    this.refreshListProjectDropdown(this.listProjectSearch);
  }

  onListProjectSearch(term: string): void {
    this.listProjectSearch = term;
    this.refreshListProjectDropdown(term);
  }

  selectListProject(project: ProjectLookupItem): void {
    this.filterForm.controls.projectId.setValue(project.id, { emitEvent: false });
    this.listProjectSearch = project.name;
    this.showListProjectDropdown = false;
    this.listProjectDropdownItems = [];
    this.loadContracts(1);
  }

  closeListProjectDropdown(): void {
    // Pequeño retraso para permitir el click en un ítem antes de ocultar.
    setTimeout(() => {
      this.showListProjectDropdown = false;
      this.listProjectSearch = this.selectedListProjectName();
      this.syncView();
    }, 150);
  }

  private refreshListProjectDropdown(term: string): void {
    const lower = term.toLowerCase().trim();
    this.listProjectDropdownItems = (
      lower.length < 1
        ? [...this.projectOptions]
        : this.projectOptions.filter((p) => p.name.toLowerCase().includes(lower))
    ).slice(0, 8);
    this.showListProjectDropdown = this.listProjectDropdownItems.length > 0;
  }

  private selectedListProjectName(): string {
    const id = this.filterForm.controls.projectId.value;
    return this.projectOptions.find((p) => p.id === id)?.name ?? '';
  }

  openCreateForm(): void {
    this.showCreateForm = true;
    this.showStatusForm = false;
    this.showCancelForm = false;
    this.createFormSubmitted = false;
    this.createFormError = null;

    this.contractForm.reset({
      projectId: '',
      lotId: '',
      clientId: '',
      contractDate: this.todayString(),
      startDate: this.todayString(),
      termMonths: 12,
      contractAmount: 0,
      downPayment: 0,
      monthlyPayment: 0,
      interestRate: 0,
      lateFeeRate: '0',
      lateFeeRateEnabled: false,
      annualTotalCost: '',
      purchaseOptionValue: '',
      monthlyPaymentDay: 1,
      currency: 'HNL',
      specialConditionText: '',
      discountPreparedAmount: '',
      discountPreparedDeadline: '',
      discountPreparedEnabled: false,
      notes: ''
    });

    this.clientSearchInput = '';
    this.clientDropdownItems = [];
    this.showClientDropdown = false;
    this.projectSearchInput = '';
    this.projectDropdownItems = [];
    this.showProjectDropdown = false;
    this.createLotOptions = [];
    this.contractForm.controls.lotId.disable({ emitEvent: false });
  }

  cancelCreateForm(): void {
    this.showCreateForm = false;
    this.createFormSubmitted = false;
    this.createFormError = null;
  }

  // ---- Client combobox ----

  onClientFocus(): void {
    if (!this.clientSearchInput.trim() || this.contractForm.controls.clientId.value) {
      return;
    }
    this.onClientSearchInput(this.clientSearchInput);
  }

  onClientSearchInput(term: string): void {
    this.clientSearchInput = term;

    if (this.contractForm.controls.clientId.value) {
      this.contractForm.controls.clientId.setValue('', { emitEvent: false });
      this.contractForm.controls.projectId.setValue('', { emitEvent: false });
      this.contractForm.controls.lotId.setValue('', { emitEvent: false });
      this.contractForm.controls.lotId.disable({ emitEvent: false });
      this.projectSearchInput = '';
      this.createLotOptions = [];
    }

    const lower = term.toLowerCase().trim();
    if (lower.length < 1) {
      this.clientDropdownItems = [];
      this.showClientDropdown = false;
      return;
    }

    this.clientDropdownItems = this.clientOptions
      .filter(
        (c) =>
          c.fullName.toLowerCase().includes(lower) ||
          (c.dni?.toLowerCase() ?? '').includes(lower)
      )
      .slice(0, 8);
    this.showClientDropdown = this.clientDropdownItems.length > 0;
  }

  selectClient(client: ClientLookupItem): void {
    this.contractForm.controls.clientId.setValue(client.id, { emitEvent: false });
    this.contractForm.controls.clientId.markAsDirty();
    this.contractForm.controls.clientId.markAsTouched();
    this.clientSearchInput = client.dni ? `${client.fullName} — ${client.dni}` : client.fullName;
    this.showClientDropdown = false;
    this.clientDropdownItems = [];
    this.contractForm.controls.projectId.setValue('', { emitEvent: false });
    this.contractForm.controls.lotId.setValue('', { emitEvent: false });
    this.contractForm.controls.lotId.disable({ emitEvent: false });
    this.projectSearchInput = '';
    this.createLotOptions = [];
  }

  closeClientDropdown(): void {
    setTimeout(() => {
      this.showClientDropdown = false;
      if (!this.contractForm.controls.clientId.value) {
        this.clientSearchInput = '';
      }
      this.syncView();
    }, 150);
  }

  // ---- Project combobox ----

  openProjectDropdown(): void {
    if (!this.isClientSelected) {
      return;
    }
    const lower = this.projectSearchInput.toLowerCase().trim();
    this.projectDropdownItems = (
      lower.length < 1
        ? [...this.projectOptions]
        : this.projectOptions.filter(
            (p) => p.name.toLowerCase().includes(lower)
          )
    ).slice(0, 8);
    this.showProjectDropdown = this.projectDropdownItems.length > 0;
  }

  onProjectSearchInput(term: string): void {
    this.projectSearchInput = term;

    if (this.contractForm.controls.projectId.value) {
      this.contractForm.controls.projectId.setValue('', { emitEvent: false });
      this.contractForm.controls.lotId.setValue('', { emitEvent: false });
      this.contractForm.controls.lotId.disable({ emitEvent: false });
      this.createLotOptions = [];
    }

    const lower = term.toLowerCase().trim();
    this.projectDropdownItems = (
      lower.length < 1
        ? [...this.projectOptions]
        : this.projectOptions.filter(
            (p) => p.name.toLowerCase().includes(lower)
          )
    ).slice(0, 8);
    this.showProjectDropdown = this.projectDropdownItems.length > 0;
  }

  selectProject(project: ProjectLookupItem): void {
    this.contractForm.controls.projectId.setValue(project.id, { emitEvent: false });
    this.contractForm.controls.projectId.markAsDirty();
    this.contractForm.controls.projectId.markAsTouched();
    this.projectSearchInput = project.name;
    this.showProjectDropdown = false;
    this.projectDropdownItems = [];
    this.contractForm.controls.lotId.setValue('', { emitEvent: false });
    this.contractForm.controls.lotId.enable({ emitEvent: false });
    this.loadCreateLotOptions(project.id);
  }

  closeProjectDropdown(): void {
    setTimeout(() => {
      this.showProjectDropdown = false;
      if (!this.contractForm.controls.projectId.value) {
        this.projectSearchInput = '';
      }
      this.syncView();
    }, 150);
  }

  submitCreateContract(): void {
    this.createFormSubmitted = true;
    this.createFormError = null;

    if (this.contractForm.invalid) {
      this.contractForm.markAllAsTouched();
      return;
    }

    const payload = this.toCreateContractPayload();
    this.isSubmitting = true;

    this.contractsApi
      .createContract(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Contrato creado correctamente.' });
          this.cancelCreateForm();
          this.reloadAfterMutation({
            page: 1,
            contractId: response.id,
            refreshLookups: true
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.createFormError = normalizedError.userMessage;
        }
      });
  }

  closeDetail(): void {
    this.selectedContractDetail = null;
    this.detailError = null;
    this.schedule = [];
    this.documents = [];
    this.scheduleError = null;
    this.documentsError = null;
    this.showStatusForm = false;
    this.showCancelForm = false;
    this.detailTab.set('info');
    this.syncView();
  }

  viewContractDetail(contractId: string): void {
    this.detailTab.set('info');
    this.detailError = null;
    this.selectedContractDetail = null;
    this.schedule = [];
    this.documents = [];
    this.scheduleError = null;
    this.documentsError = null;
    this.showStatusForm = false;
    this.showCancelForm = false;
    this.isDetailLoading = true;

    this.contractsApi
      .getContractById(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (detail) => {
          this.selectedContractDetail = detail;
          this.statusForm.patchValue({ status: detail.status });
          if (this.canViewSchedule()) {
            this.loadSchedule(detail.id);
          }
          if (this.canViewDocuments()) {
            this.loadDocuments(detail.id);
          }
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
        }
      });
  }

  openStatusForm(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.showStatusForm = true;
    this.showCancelForm = false;
    this.statusError = null;
    this.statusFormSubmitted = false;
    this.statusForm.reset({
      status: this.normalizeContractStatus(this.selectedContractDetail.status),
      notes: ''
    });
  }

  cancelStatusForm(): void {
    this.showStatusForm = false;
    this.statusFormSubmitted = false;
    this.statusError = null;
  }

  submitStatusUpdate(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.statusFormSubmitted = true;
    this.statusError = null;
    if (this.statusForm.invalid) {
      this.statusForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se cambiara el estado del contrato ${this.selectedContractDetail.contractNumber}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const payload: UpdateContractStatusRequest = {
      status: this.statusForm.controls.status.value,
      notes: this.cleanString(this.statusForm.controls.notes.value)
    };

    this.isSubmitting = true;
    this.contractsApi
      .updateContractStatus(this.selectedContractDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Estado de contrato actualizado correctamente.' });
          this.showStatusForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            contractId: response.id,
            refreshLookups: true
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.statusError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al actualizar estado: ${normalizedError.userMessage}`);
          }
        }
      });
  }

  openCancelForm(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.showCancelForm = true;
    this.showStatusForm = false;
    this.cancelError = null;
    this.cancelFormSubmitted = false;
    this.cancelForm.reset({ notes: '' });
  }

  cancelCancelForm(): void {
    this.showCancelForm = false;
    this.cancelFormSubmitted = false;
    this.cancelError = null;
  }

  submitCancelContract(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.cancelFormSubmitted = true;
    this.cancelError = null;
    if (this.cancelForm.invalid) {
      this.cancelForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se cancelara el contrato ${this.selectedContractDetail.contractNumber}. Esta accion es de alto impacto. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const payload: CancelContractRequest = {
      notes: this.cleanString(this.cancelForm.controls.notes.value)
    };

    this.isSubmitting = true;
    this.contractsApi
      .cancelContract(this.selectedContractDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Contrato cancelado correctamente.' });
          this.showCancelForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            contractId: response.id,
            refreshLookups: true
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.cancelError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al cancelar contrato: ${normalizedError.userMessage}`);
          }
        }
      });
  }

  generateDocuments(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    const confirmed = globalThis.confirm(
      `Se generaran documentos para el contrato ${this.selectedContractDetail.contractNumber}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    this.isGeneratingDocuments = true;
    this.contractsApi
      .generateDocuments(this.selectedContractDetail.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isGeneratingDocuments = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          this.feedback.show({
            level: 'success',
            text: 'Documentos generados correctamente.'
          });
          this.reloadAfterMutation({
            page: this.currentPage,
            contractId: this.selectedContractDetail!.id
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al generar documentos: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  private reloadAfterMutation(options: {
    page: number;
    contractId?: string;
    refreshLookups?: boolean;
  }): void {
    if (options.refreshLookups) {
      this.loadLookupOptions();
      if (this.contractForm.controls.projectId.value) {
        this.loadCreateLotOptions(this.contractForm.controls.projectId.value);
      }
    }

    this.loadContracts(options.page);
    if (options.contractId) {
      this.viewContractDetail(options.contractId);
    }
  }

  refreshSchedule(): void {
    if (!this.selectedContractDetail || !this.canViewSchedule()) {
      return;
    }

    this.loadSchedule(this.selectedContractDetail.id);
  }

  refreshDocuments(): void {
    if (!this.selectedContractDetail || !this.canViewDocuments()) {
      return;
    }

    this.loadDocuments(this.selectedContractDetail.id);
  }

  resolveProjectLabel(projectId: string): string {
    const option = this.projectOptions.find((item) => item.id === projectId);
    if (!option) {
      return projectId;
    }

    return option.name;
  }

  resolveLotLabel(lotId: string): string {
    const option = this.lotOptions.find((item) => item.id === lotId)
      ?? this.createLotOptions.find((item) => item.id === lotId);
    if (!option) {
      return lotId;
    }

    return option.fullCode;
  }

  resolveClientLabel(clientId: string): string {
    const option = this.clientOptions.find((item) => item.id === clientId);
    if (!option) {
      return clientId;
    }

    return option.fullName;
  }

  protected loadContracts(page: number): void {
    const projectId = this.cleanString(this.filterForm.controls.projectId.value);
    if (!projectId) {
      // Sin proyecto no se consulta el backend; se muestra el estado vacio.
      this.contracts = [];
      this.totalCount = 0;
      this.currentPage = 1;
      this.listError = null;
      this.isLoading = false;
      return;
    }

    this.listError = null;
    this.isLoading = true;

    const query: GetProjectContractsQuery = {
      projectId,
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      status: this.cleanString(this.filterForm.controls.status.value),
      search: this.cleanString(this.filterForm.controls.search.value),
      fromDate: this.cleanString(this.filterForm.controls.fromDate.value),
      toDate: this.cleanString(this.filterForm.controls.toDate.value)
    };

    this.contractsApi
      .getProjectContracts(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<ContractListItemResponse>) => {
          this.contracts = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadLookupOptions(): void {
    this.isLookupLoading = true;

    this.contractsApi
      .getProjectOptions({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        search: null,
        status: null
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
        }
      });

    this.contractsApi
      .getLotOptions({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        projectId: null,
        blockId: null,
        status: null,
        search: null,
        minArea: null,
        maxArea: null,
        minPrice: null,
        maxPrice: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.lotOptions = response.items;
          this.syncView();
        },
        error: () => {
          this.lotOptions = [];
          this.syncView();
        }
      });

    this.contractsApi
      .getClientOptions({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        search: null,
        dni: null,
        rtn: null,
        status: null,
        department: null,
        municipality: null
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
          this.clientOptions = response.items;
        },
        error: () => {
          this.clientOptions = [];
        }
      });
  }

  private loadCreateLotOptions(projectId: string | null): void {
    if (!projectId) {
      this.createLotOptions = [];
      return;
    }

    this.contractsApi
      .getLotOptions({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        projectId,
        blockId: null,
        status: null,
        search: null,
        minArea: null,
        maxArea: null,
        minPrice: null,
        maxPrice: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.createLotOptions = response.items.filter((item) => item.status === 'Disponible');
          this.syncView();
        },
        error: () => {
          this.createLotOptions = [];
          this.syncView();
        }
      });
  }

  private loadSchedule(contractId: string): void {
    this.scheduleError = null;
    this.isScheduleLoading = true;

    this.contractsApi
      .getSchedule(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isScheduleLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.schedule = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.scheduleError = normalizedError.userMessage;
          this.schedule = [];
        }
      });
  }

  private loadDocuments(contractId: string): void {
    this.documentsError = null;
    this.isDocumentsLoading = true;

    this.contractsApi
      .getDocuments(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDocumentsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.documents = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.documentsError = normalizedError.userMessage;
          this.documents = [];
        }
      });
  }

  private toCreateContractPayload(): CreateContractRequest {
    const raw = this.contractForm.getRawValue();

    return {
      projectId: raw.projectId.trim(),
      lotId: raw.lotId.trim(),
      clientId: raw.clientId.trim(),
      contractDate: raw.contractDate,
      startDate: raw.startDate,
      termMonths: Number(raw.termMonths),
      contractAmount: Number(raw.contractAmount),
      downPayment: Number(raw.downPayment),
      monthlyPayment: Number(raw.monthlyPayment),
      interestRate: Number(raw.interestRate),
      lateFeeRate: this.toNullableNumber(raw.lateFeeRate),
      lateFeeRateEnabled: raw.lateFeeRateEnabled,
      annualTotalCost: this.toNullableNumber(raw.annualTotalCost),
      purchaseOptionValue: this.toNullableNumber(raw.purchaseOptionValue),
      monthlyPaymentDay: Number(raw.monthlyPaymentDay),
      currency: this.cleanString(raw.currency) ?? 'HNL',
      specialConditionText: this.cleanString(raw.specialConditionText),
      discountPreparedAmount: this.toNullableNumber(raw.discountPreparedAmount),
      discountPreparedDeadline: this.cleanString(raw.discountPreparedDeadline),
      discountPreparedEnabled: raw.discountPreparedEnabled,
      notes: this.cleanString(raw.notes)
    };
  }

  private normalizeContractStatus(status: string): ContractStatus {
    const match = this.contractStatuses.find((item) => item === status);
    return match ?? 'Borrador';
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

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
