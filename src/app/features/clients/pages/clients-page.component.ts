import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject, signal } from '@angular/core';
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
  ClientBeneficiaryResponse,
  ClientDetailResponse,
  ClientListItemResponse,
  ClientPersonType,
  ClientReferenceResponse,
  ClientStatus,
  CreateClientBeneficiaryRequest,
  CreateClientRequest,
  CreateClientReferenceRequest,
  GetClientsQuery,
  PagedResult,
  UpdateClientBeneficiaryRequest,
  UpdateClientRequest,
  UpdateClientReferenceRequest
} from '../models/clients.models';
import { ClientsApiService } from '../services/clients-api.service';

@Component({
  selector: 'app-clients-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent
  ],
  templateUrl: './clients-page.component.html',
  styleUrl: './clients-page.component.scss'
})
export class ClientsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canCreate = computed(() => this.authSession.hasPermission('Clients.Create'));
  readonly canUpdate = computed(() => this.authSession.hasPermission('Clients.Update'));
  readonly canDisable = computed(() => this.authSession.hasPermission('Clients.Disable'));

  readonly personTypes: ReadonlyArray<ClientPersonType> = ['Natural', 'Juridica'];
  readonly statuses: ReadonlyArray<ClientStatus> = ['Activo', 'Inactivo', 'Bloqueado'];
  readonly documentTypes = [
    { value: 'Dni', label: 'DNI' },
    { value: 'Passport', label: 'Pasaporte' }
  ] as const;
  readonly maritalStatuses = [
    { value: 'Soltero', label: 'Soltero/a' },
    { value: 'Casado', label: 'Casado/a' },
    { value: 'Divorciado', label: 'Divorciado/a' },
    { value: 'Viudo', label: 'Viudo/a' },
    { value: 'UnionLibre', label: 'Unión libre' }
  ] as const;

  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(256)]],
    dni: ['', [Validators.maxLength(32)]],
    rtn: ['', [Validators.maxLength(32)]],
    pageSize: [20, [Validators.min(1), Validators.max(100)]]
  });

  readonly clientForm = this.formBuilder.nonNullable.group({
    personType: ['Natural', [Validators.required, Validators.maxLength(32)]],
    firstName: ['', [Validators.required, Validators.maxLength(256)]],
    lastName: ['', [Validators.maxLength(256)]],
    documentType: ['', [Validators.required]],
    dni: ['', [Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9-]{6,32}$/)]],
    rtn: ['', [Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9-]{6,32}$/)]],
    nationality: ['', [Validators.maxLength(64)]],
    maritalStatus: ['', [Validators.maxLength(64)]],
    birthDate: [''],
    mobile: ['', [Validators.maxLength(32), Validators.pattern(/^[0-9+()\-\s]{7,32}$/)]],
    email: ['', [Validators.maxLength(256), Validators.email]],
    address: ['', [Validators.maxLength(512)]],
    status: ['Activo', [Validators.maxLength(32)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  readonly beneficiaryForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(256)]],
    documentType: [''],
    dni: ['', [Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9-]{6,32}$/)]],
    phone: ['', [Validators.maxLength(32), Validators.pattern(/^[0-9+()\-\s]{7,32}$/)]],
    relationship: ['', [Validators.maxLength(128)]],
    address: ['', [Validators.maxLength(512)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  readonly referenceForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(256)]],
    phone: ['', [Validators.maxLength(32), Validators.pattern(/^[0-9+()\-\s]{7,32}$/)]],
    relationshipOrNotes: ['', [Validators.maxLength(256)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  // Detail modal signals
  readonly showClientDetailModal = signal(false);
  readonly isDetailLoading = signal(false);
  readonly selectedClientDetail = signal<ClientDetailResponse | null>(null);
  readonly detailError = signal<string | null>(null);

  // Form tab signals
  readonly activeClientTab = signal<'general' | 'beneficiaries' | 'references'>('general');
  readonly isEditingClient = computed(() => !!this.editingClientId);

  clients: ReadonlyArray<ClientListItemResponse> = [];
  beneficiaries: ReadonlyArray<ClientBeneficiaryResponse> = [];
  references: ReadonlyArray<ClientReferenceResponse> = [];

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;
  isBeneficiariesLoading = false;
  beneficiariesLoaded = false;
  isReferencesLoading = false;
  referencesLoaded = false;

  showClientForm = false;
  showBeneficiaryForm = false;
  showReferenceForm = false;

  editingClientId: string | null = null;
  editingBeneficiaryId: string | null = null;
  editingReferenceId: string | null = null;

  clientFormSubmitted = false;
  beneficiaryFormSubmitted = false;
  referenceFormSubmitted = false;

  listError: string | null = null;
  clientFormError: string | null = null;
  beneficiariesError: string | null = null;
  referencesError: string | null = null;
  beneficiaryFormError: string | null = null;
  referenceFormError: string | null = null;

  readonly isJuridicaSelected = computed(() => this.clientForm.controls.personType.value === 'Juridica');

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  ngOnInit(): void {
    this.configurePersonTypeRules();
    this.loadClients(1);
  }

  applyFilters(): void {
    this.loadClients(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      search: '',
      dni: '',
      rtn: '',
      pageSize: 20
    });
    this.loadClients(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadClients(1);
  }

  openCreateClientForm(): void {
    this.editingClientId = null;
    this.clientFormError = null;
    this.clientFormSubmitted = false;
    this.showClientForm = true;
    this.activeClientTab.set('general');
    this.beneficiaries = [];
    this.beneficiariesLoaded = false;
    this.references = [];
    this.referencesLoaded = false;
    this.clientForm.reset({
      personType: 'Natural',
      firstName: '',
      lastName: '',
      documentType: '',
      dni: '',
      rtn: '',
      nationality: '',
      maritalStatus: '',
      birthDate: '',
      mobile: '',
      email: '',
      address: '',
      status: 'Activo',
      notes: ''
    });
    this.applyLastNameRequirement(this.clientForm.controls.personType.value);
  }

  openEditClientForm(clientId: string): void {
    this.editingClientId = clientId;
    this.clientFormError = null;
    this.clientFormSubmitted = false;
    this.showClientForm = true;
    this.activeClientTab.set('general');
    this.beneficiaries = [];
    this.beneficiariesLoaded = false;
    this.references = [];
    this.referencesLoaded = false;
    this.isSubmitting = true;

    this.clientsApi
      .getClientById(clientId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (client) => {
          this.fillClientForm(client);
          this.loadBeneficiaries(clientId);
          this.loadReferences(clientId);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.clientFormError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  cancelClientForm(): void {
    this.showClientForm = false;
    this.editingClientId = null;
    this.clientFormError = null;
    this.clientFormSubmitted = false;
    this.activeClientTab.set('general');
  }

  submitClient(): void {
    this.clientFormSubmitted = true;
    this.clientFormError = null;

    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const createPayload = this.toCreateClientPayload();
    const updatePayload = this.toUpdateClientPayload();
    this.isSubmitting = true;

    const request$ = this.editingClientId
      ? this.clientsApi.updateClient(this.editingClientId, updatePayload)
      : this.clientsApi.createClient(createPayload);

    request$
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (client) => {
          const targetPage = this.editingClientId ? this.currentPage : 1;
          this.feedback.show({
            level: 'success',
            text: this.editingClientId
              ? 'Cliente actualizado correctamente.'
              : 'Cliente creado correctamente.'
          });

          this.cancelClientForm();
          this.loadClients(targetPage);
          if (this.showClientDetailModal() && this.selectedClientDetail()?.id === client.id) {
            this.viewClientDetail(client.id);
          }
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.clientFormError = normalizedError.userMessage;
        }
      });
  }

  viewClientDetail(clientId: string): void {
    this.detailError.set(null);
    this.selectedClientDetail.set(null);
    this.isDetailLoading.set(true);
    this.showClientDetailModal.set(true);

    this.clientsApi
      .getClientById(clientId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading.set(false);
          this.syncView();
        })
      )
      .subscribe({
        next: (client) => {
          this.selectedClientDetail.set(client);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError.set(normalizedError.userMessage);
        }
      });
  }

  closeClientDetail(): void {
    this.showClientDetailModal.set(false);
    this.selectedClientDetail.set(null);
    this.detailError.set(null);
  }

  setClientTab(tab: 'general' | 'beneficiaries' | 'references'): void {
    this.activeClientTab.set(tab);

    if (!this.editingClientId) {
      return;
    }

    if (tab === 'beneficiaries' && !this.beneficiariesLoaded && !this.isBeneficiariesLoading) {
      this.loadBeneficiaries(this.editingClientId);
    }

    if (tab === 'references' && !this.referencesLoaded && !this.isReferencesLoading) {
      this.loadReferences(this.editingClientId);
    }
  }

  disableClient(client: ClientListItemResponse): void {
    if (!this.canDisable()) {
      return;
    }

    const confirmed = globalThis.confirm(`Se deshabilitara el cliente "${client.fullName}". Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.isSubmitting = true;
    this.clientsApi
      .disableClient(client.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          this.feedback.show({ level: 'success', text: 'Cliente deshabilitado correctamente.' });
          this.loadClients(this.currentPage);
          if (this.showClientDetailModal() && this.selectedClientDetail()?.id === client.id) {
            this.viewClientDetail(client.id);
          }
        },
        error: (error) => {
          this.handleOperationError(error, 'No fue posible deshabilitar el cliente.');
        }
      });
  }

  openCreateBeneficiaryForm(): void {
    if (!this.editingClientId) {
      return;
    }

    this.editingBeneficiaryId = null;
    this.beneficiaryFormSubmitted = false;
    this.beneficiaryFormError = null;
    this.showBeneficiaryForm = true;
    this.beneficiaryForm.reset({
      fullName: '',
      documentType: '',
      dni: '',
      phone: '',
      relationship: '',
      address: '',
      notes: ''
    });
  }

  openEditBeneficiaryForm(beneficiary: ClientBeneficiaryResponse): void {
    this.editingBeneficiaryId = beneficiary.id;
    this.beneficiaryFormSubmitted = false;
    this.beneficiaryFormError = null;
    this.showBeneficiaryForm = true;
    this.beneficiaryForm.reset({
      fullName: beneficiary.fullName,
      documentType: beneficiary.documentType ?? '',
      dni: beneficiary.dni,
      phone: beneficiary.phone,
      relationship: beneficiary.relationship,
      address: beneficiary.address,
      notes: beneficiary.notes
    });
  }

  cancelBeneficiaryForm(): void {
    this.showBeneficiaryForm = false;
    this.editingBeneficiaryId = null;
    this.beneficiaryFormSubmitted = false;
    this.beneficiaryFormError = null;
  }

  submitBeneficiary(): void {
    if (!this.editingClientId) {
      return;
    }

    this.beneficiaryFormSubmitted = true;
    this.beneficiaryFormError = null;
    if (this.beneficiaryForm.invalid) {
      this.beneficiaryForm.markAllAsTouched();
      return;
    }

    const createPayload = this.toCreateBeneficiaryPayload();
    const updatePayload = this.toUpdateBeneficiaryPayload();
    this.isSubmitting = true;

    const request$ = this.editingBeneficiaryId
      ? this.clientsApi.updateBeneficiary(this.editingBeneficiaryId, updatePayload)
      : this.clientsApi.createBeneficiary(this.editingClientId, createPayload);

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
          this.feedback.show({
            level: 'success',
            text: this.editingBeneficiaryId
              ? 'Beneficiario actualizado correctamente.'
              : 'Beneficiario creado correctamente.'
          });
          this.cancelBeneficiaryForm();
          this.loadBeneficiaries(this.editingClientId!);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.beneficiaryFormError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  deleteBeneficiary(beneficiary: ClientBeneficiaryResponse): void {
    if (!this.canUpdate()) {
      return;
    }

    const confirmed = globalThis.confirm(`Se eliminara el beneficiario "${beneficiary.fullName}". Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.isSubmitting = true;
    this.clientsApi
      .deleteBeneficiary(beneficiary.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          this.feedback.show({ level: 'success', text: 'Beneficiario eliminado correctamente.' });
          if (this.editingClientId) {
            this.loadBeneficiaries(this.editingClientId);
          }
        },
        error: (error) => {
          this.handleOperationError(error, 'No fue posible eliminar el beneficiario.');
        }
      });
  }

  openCreateReferenceForm(): void {
    if (!this.editingClientId) {
      return;
    }

    this.editingReferenceId = null;
    this.referenceFormSubmitted = false;
    this.referenceFormError = null;
    this.showReferenceForm = true;
    this.referenceForm.reset({
      fullName: '',
      phone: '',
      relationshipOrNotes: '',
      notes: ''
    });
  }

  openEditReferenceForm(reference: ClientReferenceResponse): void {
    this.editingReferenceId = reference.id;
    this.referenceFormSubmitted = false;
    this.referenceFormError = null;
    this.showReferenceForm = true;
    this.referenceForm.reset({
      fullName: reference.fullName,
      phone: reference.phone,
      relationshipOrNotes: reference.relationshipOrNotes,
      notes: reference.notes
    });
  }

  cancelReferenceForm(): void {
    this.showReferenceForm = false;
    this.editingReferenceId = null;
    this.referenceFormSubmitted = false;
    this.referenceFormError = null;
  }

  submitReference(): void {
    if (!this.editingClientId) {
      return;
    }

    this.referenceFormSubmitted = true;
    this.referenceFormError = null;
    if (this.referenceForm.invalid) {
      this.referenceForm.markAllAsTouched();
      return;
    }

    const createPayload = this.toCreateReferencePayload();
    const updatePayload = this.toUpdateReferencePayload();
    this.isSubmitting = true;

    const request$ = this.editingReferenceId
      ? this.clientsApi.updateReference(this.editingReferenceId, updatePayload)
      : this.clientsApi.createReference(this.editingClientId, createPayload);

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
          this.feedback.show({
            level: 'success',
            text: this.editingReferenceId
              ? 'Referencia actualizada correctamente.'
              : 'Referencia creada correctamente.'
          });
          this.cancelReferenceForm();
          this.loadReferences(this.editingClientId!);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.referenceFormError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  deleteReference(reference: ClientReferenceResponse): void {
    if (!this.canUpdate()) {
      return;
    }

    const confirmed = globalThis.confirm(`Se eliminara la referencia "${reference.fullName}". Deseas continuar?`);
    if (!confirmed) {
      return;
    }

    this.isSubmitting = true;
    this.clientsApi
      .deleteReference(reference.id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: () => {
          this.feedback.show({ level: 'success', text: 'Referencia eliminada correctamente.' });
          if (this.editingClientId) {
            this.loadReferences(this.editingClientId);
          }
        },
        error: (error) => {
          this.handleOperationError(error, 'No fue posible eliminar la referencia.');
        }
      });
  }

  protected loadClients(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetClientsQuery = {
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      search: this.cleanString(this.filterForm.controls.search.value),
      dni: this.cleanString(this.filterForm.controls.dni.value),
      rtn: this.cleanString(this.filterForm.controls.rtn.value)
    };

    this.clientsApi
      .getClients(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<ClientListItemResponse>) => {
          this.clients = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadBeneficiaries(clientId: string): void {
    this.beneficiariesError = null;
    this.isBeneficiariesLoading = true;

    this.clientsApi
      .getBeneficiaries(clientId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isBeneficiariesLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.beneficiaries = response;
          this.beneficiariesLoaded = true;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.beneficiariesError = normalizedError.userMessage;
          this.beneficiaries = [];
        }
      });
  }

  private loadReferences(clientId: string): void {
    this.referencesError = null;
    this.isReferencesLoading = true;

    this.clientsApi
      .getReferences(clientId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isReferencesLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.references = response;
          this.referencesLoaded = true;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.referencesError = normalizedError.userMessage;
          this.references = [];
        }
      });
  }

  private fillClientForm(client: ClientDetailResponse): void {
    this.clientForm.reset({
      personType: this.normalizePersonType(client.personType),
      firstName: client.firstName ?? '',
      lastName: client.lastName ?? '',
      documentType: client.documentType ?? '',
      dni: client.dni ?? '',
      rtn: client.rtn ?? '',
      nationality: client.nationality ?? '',
      maritalStatus: client.maritalStatus ?? '',
      birthDate: client.birthDate ?? '',
      mobile: client.mobile ?? '',
      email: client.email ?? '',
      address: client.address ?? '',
      status: this.normalizeStatus(client.status),
      notes: client.notes ?? ''
    });
    this.applyLastNameRequirement(this.clientForm.controls.personType.value);
  }

  private configurePersonTypeRules(): void {
    this.applyLastNameRequirement(this.clientForm.controls.personType.value);
    this.clientForm.controls.personType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((personType) => {
        this.applyLastNameRequirement(personType);
      });
  }

  private applyLastNameRequirement(personType: string): void {
    const control = this.clientForm.controls.lastName;
    if (personType === 'Natural') {
      control.setValidators([Validators.required, Validators.maxLength(256)]);
    } else {
      control.setValidators([Validators.maxLength(256)]);
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  private toCreateClientPayload(): CreateClientRequest {
    const raw = this.clientForm.getRawValue();
    return {
      personType: raw.personType.trim(),
      firstName: raw.firstName.trim(),
      lastName: this.cleanString(raw.lastName),
      documentType: raw.documentType.trim(),
      dni: this.cleanString(raw.dni),
      rtn: this.cleanString(raw.rtn),
      nationality: this.cleanString(raw.nationality),
      maritalStatus: this.cleanString(raw.maritalStatus),
      birthDate: this.cleanString(raw.birthDate),
      mobile: this.cleanString(raw.mobile),
      email: this.cleanString(raw.email),
      address: this.cleanString(raw.address),
      status: this.cleanString(raw.status),
      notes: this.cleanString(raw.notes)
    };
  }

  private toUpdateClientPayload(): UpdateClientRequest {
    return this.toCreateClientPayload();
  }

  private toCreateBeneficiaryPayload(): CreateClientBeneficiaryRequest {
    const raw = this.beneficiaryForm.getRawValue();
    return {
      fullName: raw.fullName.trim(),
      documentType: this.cleanString(raw.documentType),
      dni: this.cleanString(raw.dni),
      phone: this.cleanString(raw.phone),
      relationship: this.cleanString(raw.relationship),
      address: this.cleanString(raw.address),
      notes: this.cleanString(raw.notes)
    };
  }

  private toUpdateBeneficiaryPayload(): UpdateClientBeneficiaryRequest {
    return this.toCreateBeneficiaryPayload();
  }

  private toCreateReferencePayload(): CreateClientReferenceRequest {
    const raw = this.referenceForm.getRawValue();
    return {
      fullName: raw.fullName.trim(),
      phone: this.cleanString(raw.phone),
      relationshipOrNotes: this.cleanString(raw.relationshipOrNotes),
      notes: this.cleanString(raw.notes)
    };
  }

  private toUpdateReferencePayload(): UpdateClientReferenceRequest {
    return this.toCreateReferencePayload();
  }

  private normalizePersonType(rawValue: string): ClientPersonType {
    return rawValue?.trim().toLowerCase() === 'juridica' ? 'Juridica' : 'Natural';
  }

  private normalizeStatus(rawValue: string): ClientStatus {
    const normalized = rawValue?.trim().toLowerCase();
    if (normalized === 'inactivo') {
      return 'Inactivo';
    }
    if (normalized === 'bloqueado') {
      return 'Bloqueado';
    }
    return 'Activo';
  }

  private handleOperationError(error: unknown, fallbackMessage: string): void {
    const normalizedError = this.apiErrorService.normalize(error);
    if (normalizedError.status === 409) {
      this.feedback.showError(`Conflicto: ${normalizedError.userMessage}`);
      return;
    }

    if (normalizedError.status === 400) {
      this.feedback.showError(normalizedError.userMessage);
      return;
    }

    this.feedback.showError(normalizedError.userMessage || fallbackMessage);
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  hasControlError(controlName: string): boolean {
    const control = this.clientForm.get(controlName);
    return !!control && control.invalid && control.touched;
  }

  getControlErrorMessage(controlName: string): string {
    const control = this.clientForm.get(controlName);
    if (!control?.errors || !control.touched) {
      return '';
    }
    if (control.errors['required']) {
      return 'Este campo es obligatorio.';
    }
    if (control.errors['maxlength']) {
      return 'Supera la longitud permitida.';
    }
    if (control.errors['pattern']) {
      return 'Formato invalido.';
    }
    if (control.errors['email']) {
      return 'Email invalido.';
    }
    return 'Valor invalido.';
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
