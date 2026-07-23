import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, catchError, debounceTime, finalize, of, switchMap } from 'rxjs';
import { HasPermissionDirective } from '../../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import {
  AssignContractRequest,
  CancelContractRequest,
  ClientLookupItem,
  ContractAssignmentPreviewResponse,
  ContractDetailResponse,
  ContractInstallmentResponse,
  ContractStatus,
  CreateContractRequest,
  GeneratedDocumentResponse,
  LotLookupItem,
  ProjectLookupItem,
  UpdateContractRequest,
  UpdateContractStatusRequest
} from '../../models/contracts.models';
import { ContractsApiService } from '../../services/contracts-api.service';

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
  selector: 'app-contract-form-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective
  ],
  templateUrl: './contract-form-page.component.html',
  styleUrl: './contract-form-page.component.scss'
})
export class ContractFormPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly contractsApi = inject(ContractsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canCreate = computed(() => this.authSession.hasPermission('Contracts.Create'));
  readonly canUpdateDraft = computed(() => this.authSession.hasPermission('Contracts.UpdateDraft'));
  readonly canViewSchedule = computed(() => this.authSession.hasPermission('PaymentSchedules.View'));
  readonly canViewDocuments = computed(() => this.authSession.hasPermission('Documents.View'));
  readonly canAssign = computed(() => this.authSession.hasPermission('Contracts.Assign'));

  readonly contractId = signal<string | null>(null);
  readonly mode = signal<'create' | 'view' | 'edit'>('create');
  readonly isCreate = computed(() => this.mode() === 'create');
  readonly isEdit = computed(() => this.mode() === 'edit');
  readonly isView = computed(() => this.mode() === 'view');
  editContractNumber = '';
  amountAuto = true;
  monthlyAuto = true;

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

  readonly contractForm = this.formBuilder.nonNullable.group(
    {
      projectId: ['', [Validators.required]],
      lotIds: [[] as string[], [Validators.required]],
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

  readonly assignForm = this.formBuilder.nonNullable.group({
    newClientId: ['', [Validators.required]],
    contractDate: [this.todayString(), [Validators.required]],
    startDate: [this.todayString(), [Validators.required]],
    termMonths: [1, [Validators.required, Validators.min(1), Validators.max(600)]],
    contractAmount: [0, [Validators.required, Validators.min(0.01)]],
    monthlyPayment: [0, [Validators.required, Validators.min(0.01)]],
    specialConditionText: ['', [Validators.maxLength(4096)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

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

  // Combobox state — cesion de derechos form (cesionario)
  assignClientSearch = '';
  assignClientDropdownItems: ReadonlyArray<ClientLookupItem> = [];
  showAssignClientDropdown = false;
  assignPreview: ContractAssignmentPreviewResponse | null = null;
  isLoadingAssignPreview = false;
  projectSearchInput = '';
  projectDropdownItems: ReadonlyArray<ProjectLookupItem> = [];
  showProjectDropdown = false;

  // Busqueda de lotes server-side (BUG-008): el proyecto puede tener mas lotes que una pagina
  // de lookup (100), asi que el termino se envia al backend en vez de filtrar localmente.
  createLotSearch = '';
  isLotSearchLoading = false;
  private lotLookupProjectId: string | null = null;
  private lotKeepSelectedIds: ReadonlyArray<string> = [];
  private readonly lotSearchTerms$ = new Subject<string>();
  // Acumula todo lote visto (carga inicial + cada busqueda), para que el total/monto de los
  // lotes ya seleccionados no dependa de que sigan visibles en la lista filtrada actual.
  private readonly lotDetailsById = new Map<string, LotLookupItem>();

  isSubmitting = false;
  isDetailLoading = false;
  isScheduleLoading = false;
  isDocumentsLoading = false;
  isGeneratingDocuments = false;
  isUploadingSigned = false;
  signedFile: File | null = null;
  signedUploadError: string | null = null;

  readonly detailTab = signal<'info' | 'schedule'>('info');

  showStatusForm = false;
  showCancelForm = false;
  showGenerateConfirm = false;
  showAssignForm = false;

  createFormSubmitted = false;
  statusFormSubmitted = false;
  cancelFormSubmitted = false;
  assignFormSubmitted = false;

  createFormError: string | null = null;
  detailError: string | null = null;
  scheduleError: string | null = null;
  documentsError: string | null = null;
  statusError: string | null = null;
  cancelError: string | null = null;
  assignError: string | null = null;

  get isClientSelected(): boolean {
    return !!this.contractForm.controls.clientId.value;
  }

  get isProjectSelected(): boolean {
    return !!this.contractForm.controls.projectId.value;
  }

  hasCreateSelections(): boolean {
    const raw = this.contractForm.getRawValue();
    return !!(raw.projectId?.trim() && (raw.lotIds?.length ?? 0) > 0 && raw.clientId?.trim());
  }

  ngOnInit(): void {
    this.loadLookupOptions();

    // Al editar manualmente el monto se desactiva la precarga automatica (suma de lotes).
    this.contractForm.controls.contractAmount.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.amountAuto = false;
        this.recalcMonthlySuggestion();
      });

    // La cuota se sugiere como piso((monto - prima) / plazo); se recalcula al cambiar
    // monto, prima o plazo, salvo que el usuario ya haya editado la cuota manualmente.
    this.contractForm.controls.downPayment.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.recalcMonthlySuggestion());
    this.contractForm.controls.termMonths.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.recalcMonthlySuggestion());
    this.contractForm.controls.monthlyPayment.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.monthlyAuto = false;
      });

    // BUG-008: el termino de busqueda de lotes se envia al backend (debounce 300ms) en vez de
    // filtrar solo la primera pagina de 100 lotes cargada en el cliente.
    this.lotSearchTerms$
      .pipe(
        debounceTime(300),
        switchMap((term) => {
          if (!this.lotLookupProjectId) {
            return of(null);
          }
          this.isLotSearchLoading = true;
          return this.contractsApi
            .getLotOptions({
              page: 1,
              pageSize: LOOKUP_PAGE_SIZE,
              projectId: this.lotLookupProjectId,
              blockId: null,
              status: null,
              search: term || null,
              minArea: null,
              maxArea: null,
              minPrice: null,
              maxPrice: null
            })
            .pipe(catchError(() => of(null)));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((response) => {
        this.isLotSearchLoading = false;
        if (response === null) {
          this.syncView();
          return;
        }
        for (const item of response.items) {
          this.lotDetailsById.set(item.id, item);
        }
        const keep = new Set(this.lotKeepSelectedIds);
        this.createLotOptions = response.items.filter(
          (item) => item.status === 'Disponible' || keep.has(item.id)
        );
        this.syncView();
      });

    const id = this.route.snapshot.paramMap.get('id');
    const routeMode = this.route.snapshot.data['mode'] as string | undefined;

    if (id && routeMode === 'edit') {
      this.mode.set('edit');
      this.contractId.set(id);
      this.loadContractForEdit(id);
    } else if (id) {
      this.mode.set('view');
      this.contractId.set(id);
      this.viewContractDetail(id);
    } else {
      this.mode.set('create');
    }
  }

  goBack(): void {
    const id = this.contractId();
    if (this.isEdit() && id) {
      void this.router.navigate(['/admin/contracts', id]);
      return;
    }
    void this.router.navigate(['/admin/contracts']);
  }

  startEdit(): void {
    const id = this.contractId();
    if (id) {
      void this.router.navigate(['/admin/contracts', id, 'edit']);
    }
  }

  // ---- Selección de lotes (multi) ----

  get selectedLotIds(): ReadonlyArray<string> {
    return this.contractForm.controls.lotIds.value ?? [];
  }

  isLotSelected(lotId: string): boolean {
    return this.selectedLotIds.includes(lotId);
  }

  toggleLot(lotId: string): void {
    const current = this.selectedLotIds;
    const next = current.includes(lotId)
      ? current.filter((id) => id !== lotId)
      : [...current, lotId];
    this.contractForm.controls.lotIds.setValue(next);
    this.contractForm.controls.lotIds.markAsDirty();
    this.contractForm.controls.lotIds.markAsTouched();
    if (next.length === 0) {
      // Sin lotes no hay base para el monto: vuelve a 0 y reactiva el modo automatico.
      this.amountAuto = true;
      this.applyLotsAmount(next);
    } else if (this.amountAuto) {
      this.applyLotsAmount(next);
    }
  }

  selectedLotsTotal(): number {
    // Usa el mapa acumulado (no createLotOptions, que solo refleja la busqueda visible
    // actual) para que un lote seleccionado siga sumando aunque ya no este en pantalla.
    return this.selectedLotIds.reduce((sum, id) => sum + (this.lotDetailsById.get(id)?.listPrice ?? 0), 0);
  }

  // Detalle completo (Bloque/Número/Precio) de los lotes ya seleccionados, para la tabla
  // removible. Usa el mapa acumulado para no depender de la pagina de busqueda actual;
  // filtra ids sin detalle disponible (no deberia pasar, pero no debe romper si pasa).
  get selectedLots(): LotLookupItem[] {
    return this.selectedLotIds
      .map((id) => this.lotDetailsById.get(id))
      .filter((lot): lot is LotLookupItem => !!lot);
  }

  private applyLotsAmount(lotIds: ReadonlyArray<string>): void {
    const total = lotIds.reduce((sum, id) => sum + (this.lotDetailsById.get(id)?.listPrice ?? 0), 0);
    // No dispara valueChanges para conservar el modo automatico.
    this.contractForm.controls.contractAmount.setValue(total, { emitEvent: false });
    this.recalcMonthlySuggestion();
  }

  // Sugiere la cuota = piso((monto - prima) / plazo), redondeada al peso menor.
  private recalcMonthlySuggestion(): void {
    if (!this.monthlyAuto) {
      return;
    }
    const raw = this.contractForm.getRawValue();
    const amount = Number(raw.contractAmount);
    const downPayment = Number(raw.downPayment);
    const term = Number(raw.termMonths);
    if (!Number.isFinite(amount) || !Number.isFinite(downPayment) || !Number.isFinite(term) || term <= 0) {
      return;
    }
    const financed = amount - downPayment;
    const suggestion = financed > 0 ? Math.floor(financed / term) : 0;
    this.contractForm.controls.monthlyPayment.setValue(suggestion, { emitEvent: false });
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
      this.contractForm.controls.lotIds.setValue([], { emitEvent: false });
      this.amountAuto = true;
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
    this.contractForm.controls.lotIds.setValue([], { emitEvent: false });
    this.amountAuto = true;
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
        : this.projectOptions.filter((p) => p.name.toLowerCase().includes(lower))
    ).slice(0, 8);
    this.showProjectDropdown = this.projectDropdownItems.length > 0;
  }

  onProjectSearchInput(term: string): void {
    this.projectSearchInput = term;

    if (this.contractForm.controls.projectId.value) {
      this.contractForm.controls.projectId.setValue('', { emitEvent: false });
      this.contractForm.controls.lotIds.setValue([], { emitEvent: false });
      this.amountAuto = true;
      this.createLotOptions = [];
    }

    const lower = term.toLowerCase().trim();
    this.projectDropdownItems = (
      lower.length < 1
        ? [...this.projectOptions]
        : this.projectOptions.filter((p) => p.name.toLowerCase().includes(lower))
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
    this.contractForm.controls.lotIds.setValue([], { emitEvent: false });
    this.amountAuto = true;
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

  submitContract(): void {
    if (this.isEdit()) {
      this.submitUpdateContract();
    } else {
      this.submitCreateContract();
    }
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
          void this.router.navigate(['/admin/contracts', response.id]);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.createFormError = normalizedError.userMessage;
        }
      });
  }

  submitUpdateContract(): void {
    this.createFormSubmitted = true;
    this.createFormError = null;

    const contractId = this.contractId();
    if (!contractId) {
      return;
    }

    if (this.contractForm.invalid) {
      this.contractForm.markAllAsTouched();
      return;
    }

    const payload = this.toUpdateContractPayload();
    this.isSubmitting = true;

    this.contractsApi
      .updateContract(contractId, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Contrato actualizado correctamente.' });
          void this.router.navigate(['/admin/contracts', response.id]);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.createFormError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al actualizar contrato: ${normalizedError.userMessage}`);
          }
        }
      });
  }

  private loadContractForEdit(contractId: string): void {
    this.detailError = null;
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
          if (detail.status !== 'Borrador') {
            this.feedback.showError('Solo los contratos en Borrador se pueden editar.');
            void this.router.navigate(['/admin/contracts', contractId]);
            return;
          }

          this.selectedContractDetail = detail;
          this.editContractNumber = detail.contractNumber;
          this.projectSearchInput = this.resolveProjectLabel(detail.projectId);
          this.clientSearchInput = this.resolveClientLabel(detail.clientId);

          // El borrador se carga con sus valores propios; no auto-sugerir monto ni cuota.
          this.amountAuto = false;
          this.monthlyAuto = false;

          this.contractForm.patchValue({
            projectId: detail.projectId,
            clientId: detail.clientId,
            contractDate: detail.contractDate,
            startDate: detail.startDate,
            termMonths: detail.termMonths,
            downPayment: detail.downPayment,
            monthlyPayment: detail.monthlyPayment,
            interestRate: detail.interestRate,
            lateFeeRate: String(detail.lateFeeRate ?? 0),
            lateFeeRateEnabled: detail.lateFeeRateEnabled,
            annualTotalCost: detail.annualTotalCost != null ? String(detail.annualTotalCost) : '',
            purchaseOptionValue: detail.purchaseOptionValue != null ? String(detail.purchaseOptionValue) : '',
            monthlyPaymentDay: detail.monthlyPaymentDay,
            currency: detail.currency,
            specialConditionText: detail.specialConditionText ?? '',
            discountPreparedAmount: detail.discountPreparedAmount != null ? String(detail.discountPreparedAmount) : '',
            discountPreparedDeadline: detail.discountPreparedDeadline ?? '',
            discountPreparedEnabled: detail.discountPreparedEnabled,
            notes: detail.notes ?? ''
          });
          // El monto se carga como valor propio del borrador (no autosuma sobre lo guardado).
          this.contractForm.controls.contractAmount.setValue(detail.contractAmount, { emitEvent: false });
          this.contractForm.controls.lotIds.setValue([...detail.lotIds]);

          this.loadCreateLotOptions(detail.projectId, detail.lotIds);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
        }
      });
  }

  // Placeholder: la generación desde template se cableará cuando se mapeen los datos.
  generateFromTemplate(): void {
    // Sin acción por ahora.
  }

  // ---- Detalle ----

  viewLinkedContract(contractId: string): void {
    void this.router.navigate(['/admin/contracts', contractId]);
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
    this.showAssignForm = false;
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
          this.viewContractDetail(response.id);
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
    this.showAssignForm = false;
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
          this.viewContractDetail(response.id);
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

  openAssignForm(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.showAssignForm = true;
    this.showStatusForm = false;
    this.showCancelForm = false;
    this.assignError = null;
    this.assignFormSubmitted = false;
    this.assignPreview = null;
    this.assignClientSearch = '';
    this.assignClientDropdownItems = [];
    this.showAssignClientDropdown = false;
    this.assignForm.reset({
      newClientId: '',
      contractDate: this.todayString(),
      startDate: this.todayString(),
      termMonths: 1,
      contractAmount: 0,
      monthlyPayment: 0,
      specialConditionText: '',
      notes: ''
    });
    this.loadAssignPreview();
  }

  cancelAssignForm(): void {
    this.showAssignForm = false;
    this.assignFormSubmitted = false;
    this.assignError = null;
  }

  private loadAssignPreview(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.isLoadingAssignPreview = true;
    this.contractsApi
      .getAssignmentPreview(this.selectedContractDetail.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoadingAssignPreview = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (preview) => {
          this.assignPreview = preview;
          this.assignForm.patchValue({
            termMonths: preview.suggestedTermMonths,
            contractAmount: preview.suggestedContractAmount,
            monthlyPayment: preview.suggestedMonthlyPayment
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.assignError = normalizedError.userMessage;
        }
      });
  }

  // ---- Cesionario combobox ----

  onAssignClientSearchInput(term: string): void {
    this.assignClientSearch = term;

    if (this.assignForm.controls.newClientId.value) {
      this.assignForm.controls.newClientId.setValue('', { emitEvent: false });
    }

    const lower = term.toLowerCase().trim();
    if (lower.length < 1) {
      this.assignClientDropdownItems = [];
      this.showAssignClientDropdown = false;
      return;
    }

    this.assignClientDropdownItems = this.clientOptions
      .filter(
        (c) =>
          c.fullName.toLowerCase().includes(lower) ||
          (c.dni?.toLowerCase() ?? '').includes(lower)
      )
      .slice(0, 8);
    this.showAssignClientDropdown = this.assignClientDropdownItems.length > 0;
  }

  selectAssignClient(client: ClientLookupItem): void {
    this.assignForm.controls.newClientId.setValue(client.id, { emitEvent: false });
    this.assignForm.controls.newClientId.markAsDirty();
    this.assignForm.controls.newClientId.markAsTouched();
    this.assignClientSearch = client.dni ? `${client.fullName} — ${client.dni}` : client.fullName;
    this.showAssignClientDropdown = false;
    this.assignClientDropdownItems = [];
  }

  closeAssignClientDropdown(): void {
    setTimeout(() => {
      this.showAssignClientDropdown = false;
      if (!this.assignForm.controls.newClientId.value) {
        this.assignClientSearch = '';
      }
      this.syncView();
    }, 150);
  }

  submitAssignContract(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.assignFormSubmitted = true;
    this.assignError = null;
    if (this.assignForm.invalid) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se cedera el contrato ${this.selectedContractDetail.contractNumber} a un contrato nuevo y este quedara cerrado. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const raw = this.assignForm.getRawValue();
    const payload: AssignContractRequest = {
      newClientId: raw.newClientId,
      contractDate: raw.contractDate,
      startDate: raw.startDate,
      termMonths: Number(raw.termMonths),
      contractAmount: Number(raw.contractAmount),
      monthlyPayment: Number(raw.monthlyPayment),
      specialConditionText: this.cleanString(raw.specialConditionText),
      notes: this.cleanString(raw.notes)
    };

    this.isSubmitting = true;
    this.contractsApi
      .assignContract(this.selectedContractDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Cesión de derechos registrada correctamente.' });
          this.showAssignForm = false;
          void this.router.navigate(['/admin/contracts', response.id]);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.assignError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al ceder el contrato: ${normalizedError.userMessage}`);
          }
        }
      });
  }

  openGenerateConfirm(): void {
    if (!this.selectedContractDetail) {
      return;
    }
    this.showGenerateConfirm = true;
  }

  cancelGenerateConfirm(): void {
    this.showGenerateConfirm = false;
  }

  downloadDocument(document: GeneratedDocumentResponse): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.contractsApi
      .downloadDocument(this.selectedContractDetail.id, document.id, 'docx')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          const anchor = globalThis.document.createElement('a');
          anchor.href = url;
          anchor.download = `${document.documentType}.docx`;
          anchor.click();
          URL.revokeObjectURL(url);
        },
        error: (error) => {
          this.feedback.showError(this.apiErrorService.normalize(error).userMessage);
        }
      });
  }

  confirmGenerate(): void {
    if (!this.selectedContractDetail) {
      return;
    }

    this.showGenerateConfirm = false;
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
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Documentos generados. El contrato queda Pendiente de firma.' });
          // Recarga el detalle para reflejar el nuevo estado (PendienteFirma).
          this.viewContractDetail(response.contractId);
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

  onSignedFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.signedFile = input.files && input.files.length > 0 ? input.files[0] : null;
    this.signedUploadError = null;
  }

  uploadSignedContract(): void {
    if (!this.selectedContractDetail || !this.signedFile) {
      this.signedUploadError = 'Selecciona el archivo del contrato firmado.';
      return;
    }

    this.isUploadingSigned = true;
    this.signedUploadError = null;
    this.contractsApi
      .uploadSignedContract(this.selectedContractDetail.id, this.signedFile)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isUploadingSigned = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Contrato firmado cargado. El contrato queda Activo.' });
          this.signedFile = null;
          this.viewContractDetail(response.id);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.signedUploadError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al cargar el firmado: ${normalizedError.userMessage}`);
          }
        }
      });
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
    return this.projectOptions.find((item) => item.id === projectId)?.name ?? projectId;
  }

  resolveLotLabel(lotId: string): string {
    const option = this.lotOptions.find((item) => item.id === lotId)
      ?? this.lotDetailsById.get(lotId);
    return option?.fullCode ?? lotId;
  }

  lotCodesSummary(detail: ContractDetailResponse): string {
    const codes = detail.lotSnapshots.map((snapshot) => snapshot.lotFullCode).filter((code) => !!code);
    return codes.length > 0 ? codes.join(', ') : this.resolveLotLabel(detail.lotId);
  }

  resolveClientLabel(clientId: string): string {
    return this.clientOptions.find((item) => item.id === clientId)?.fullName ?? clientId;
  }

  private loadLookupOptions(): void {
    this.contractsApi
      .getProjectOptions({ page: 1, pageSize: LOOKUP_PAGE_SIZE, search: null, status: null })
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.clientOptions = response.items;
          this.syncView();
        },
        error: () => {
          this.clientOptions = [];
          this.syncView();
        }
      });
  }

  onCreateLotSearchInput(term: string): void {
    this.createLotSearch = term;
    this.lotSearchTerms$.next(term.trim());
  }

  private loadCreateLotOptions(projectId: string | null, keepSelectedIds: ReadonlyArray<string> = []): void {
    this.lotLookupProjectId = projectId;
    this.lotKeepSelectedIds = keepSelectedIds;
    this.createLotSearch = '';

    if (!projectId) {
      this.createLotOptions = [];
      return;
    }

    const keep = new Set(keepSelectedIds);
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
          for (const item of response.items) {
            this.lotDetailsById.set(item.id, item);
          }
          // Disponibles para elegir + los ya seleccionados del contrato (que estan Contratado).
          this.createLotOptions = response.items.filter(
            (item) => item.status === 'Disponible' || keep.has(item.id)
          );
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
      lotIds: [...raw.lotIds],
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

  private toUpdateContractPayload(): UpdateContractRequest {
    const raw = this.contractForm.getRawValue();

    return {
      lotIds: [...raw.lotIds],
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
    return this.contractStatuses.find((item) => item === status) ?? 'Borrador';
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
