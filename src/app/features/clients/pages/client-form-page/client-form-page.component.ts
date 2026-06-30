import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { HasPermissionDirective } from '../../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../../shared/components/loading-state/loading-state.component';
import {
  ClientBeneficiaryResponse,
  ClientDetailResponse,
  ClientPersonType,
  ClientReferenceResponse,
  ClientStatus,
  CreateClientBeneficiaryRequest,
  CreateClientRequest,
  CreateClientReferenceRequest,
  UpdateClientBeneficiaryRequest,
  UpdateClientRequest,
  UpdateClientReferenceRequest
} from '../../models/clients.models';
import { ClientsApiService } from '../../services/clients-api.service';

@Component({
  selector: 'app-client-form-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective
  ],
  templateUrl: './client-form-page.component.html',
  styleUrl: './client-form-page.component.scss'
})
export class ClientFormPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canCreate = computed(() => this.authSession.hasPermission('Clients.Create'));
  readonly canUpdate = computed(() => this.authSession.hasPermission('Clients.Update'));

  readonly clientId = signal<string | null>(null);
  readonly isEditing = computed(() => this.clientId() !== null);
  readonly canSave = computed(() => (this.isEditing() ? this.canUpdate() : this.canCreate()));
  readonly loadedClient = signal<ClientDetailResponse | null>(null);

  private readonly defaultNationality = 'Hondureña';
  readonly isJuridica = signal(false);
  readonly clientNationalityRequired = signal(false);
  readonly beneficiaryNationalityRequired = signal(false);

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

  readonly clientForm = this.formBuilder.nonNullable.group({
    personType: ['Natural', [Validators.required, Validators.maxLength(32)]],
    firstName: ['', [Validators.required, Validators.maxLength(256)]],
    lastName: ['', [Validators.maxLength(256)]],
    documentType: ['', [Validators.required]],
    dni: ['', [Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9-]{6,32}$/)]],
    rtn: ['', [Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9-]{6,32}$/)]],
    nationality: ['', [Validators.maxLength(64)]],
    maritalStatus: ['', [Validators.maxLength(64)]],
    birthDate: ['', [Validators.required]],
    mobile: ['', [Validators.maxLength(32), Validators.pattern(/^[0-9+()\-\s]{7,32}$/)]],
    email: ['', [Validators.maxLength(256), Validators.email]],
    address: ['', [Validators.maxLength(512)]],
    status: ['Activo', [Validators.maxLength(32)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  readonly beneficiaryForm = this.formBuilder.nonNullable.group({
    fullName: ['', [Validators.required, Validators.maxLength(256)]],
    birthDate: ['', [Validators.required]],
    documentType: [''],
    dni: ['', [Validators.required, Validators.maxLength(32), Validators.pattern(/^[A-Za-z0-9-]{6,32}$/)]],
    nationality: ['', [Validators.maxLength(64)]],
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

  readonly activeClientTab = signal<'general' | 'beneficiaries' | 'references'>('general');

  beneficiaries: ReadonlyArray<ClientBeneficiaryResponse> = [];
  references: ReadonlyArray<ClientReferenceResponse> = [];

  isLoading = false;
  isSubmitting = false;
  isBeneficiariesLoading = false;
  beneficiariesLoaded = false;
  isReferencesLoading = false;
  referencesLoaded = false;

  showBeneficiaryForm = false;
  showReferenceForm = false;

  editingBeneficiaryId: string | null = null;
  editingReferenceId: string | null = null;

  clientFormSubmitted = false;
  beneficiaryFormSubmitted = false;
  referenceFormSubmitted = false;

  loadError: string | null = null;
  clientFormError: string | null = null;
  beneficiariesError: string | null = null;
  referencesError: string | null = null;
  beneficiaryFormError: string | null = null;
  referenceFormError: string | null = null;

  ngOnInit(): void {
    this.configurePersonTypeRules();
    this.configureDocumentTypeRules();

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.clientId.set(id);
      this.loadClient(id);
    } else if (!this.canCreate()) {
      this.clientForm.disable({ emitEvent: false });
    }
  }

  goBack(): void {
    void this.router.navigate(['/admin/clients']);
  }

  submitClient(): void {
    if (!this.canSave()) {
      return;
    }

    this.clientFormSubmitted = true;
    this.clientFormError = null;

    if (this.clientForm.invalid) {
      this.clientForm.markAllAsTouched();
      return;
    }

    const id = this.clientId();
    this.isSubmitting = true;

    const request$ = id
      ? this.clientsApi.updateClient(id, this.toUpdateClientPayload())
      : this.clientsApi.createClient(this.toCreateClientPayload());

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
          this.feedback.show({
            level: 'success',
            text: id ? 'Cliente actualizado correctamente.' : 'Cliente creado correctamente.'
          });

          if (id) {
            this.loadedClient.set(client);
            this.fillClientForm(client);
          } else {
            void this.router.navigate(['/admin/clients', client.id]);
          }
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.clientFormError = normalizedError.userMessage;
        }
      });
  }

  setClientTab(tab: 'general' | 'beneficiaries' | 'references'): void {
    this.activeClientTab.set(tab);

    const id = this.clientId();
    if (!id) {
      return;
    }

    if (tab === 'beneficiaries' && !this.beneficiariesLoaded && !this.isBeneficiariesLoading) {
      this.loadBeneficiaries(id);
    }

    if (tab === 'references' && !this.referencesLoaded && !this.isReferencesLoading) {
      this.loadReferences(id);
    }
  }

  openCreateBeneficiaryForm(): void {
    if (!this.clientId()) {
      return;
    }

    this.editingBeneficiaryId = null;
    this.beneficiaryFormSubmitted = false;
    this.beneficiaryFormError = null;
    this.showBeneficiaryForm = true;
    this.beneficiaryForm.reset(
      {
        fullName: '',
        birthDate: '',
        documentType: '',
        dni: '',
        nationality: '',
        phone: '',
        relationship: '',
        address: '',
        notes: ''
      },
      { emitEvent: false }
    );
    this.applyBeneficiaryNationalityRule(this.beneficiaryForm.controls.documentType.value);
  }

  openEditBeneficiaryForm(beneficiary: ClientBeneficiaryResponse): void {
    this.editingBeneficiaryId = beneficiary.id;
    this.beneficiaryFormSubmitted = false;
    this.beneficiaryFormError = null;
    this.showBeneficiaryForm = true;
    this.beneficiaryForm.reset(
      {
        fullName: beneficiary.fullName,
        birthDate: beneficiary.birthDate ?? '',
        documentType: beneficiary.documentType ?? '',
        dni: beneficiary.dni,
        nationality: beneficiary.nationality ?? '',
        phone: beneficiary.phone,
        relationship: beneficiary.relationship,
        address: beneficiary.address,
        notes: beneficiary.notes
      },
      { emitEvent: false }
    );
    this.applyBeneficiaryNationalityRule(this.beneficiaryForm.controls.documentType.value);
  }

  cancelBeneficiaryForm(): void {
    this.showBeneficiaryForm = false;
    this.editingBeneficiaryId = null;
    this.beneficiaryFormSubmitted = false;
    this.beneficiaryFormError = null;
  }

  submitBeneficiary(): void {
    const id = this.clientId();
    if (!id) {
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
      : this.clientsApi.createBeneficiary(id, createPayload);

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
          this.loadBeneficiaries(id);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.beneficiaryFormError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  deleteBeneficiary(beneficiary: ClientBeneficiaryResponse): void {
    const id = this.clientId();
    if (!id || !this.canUpdate()) {
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
          this.loadBeneficiaries(id);
        },
        error: (error) => {
          this.handleOperationError(error, 'No fue posible eliminar el beneficiario.');
        }
      });
  }

  openCreateReferenceForm(): void {
    if (!this.clientId()) {
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
    const id = this.clientId();
    if (!id) {
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
      : this.clientsApi.createReference(id, createPayload);

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
          this.loadReferences(id);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.referenceFormError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  deleteReference(reference: ClientReferenceResponse): void {
    const id = this.clientId();
    if (!id || !this.canUpdate()) {
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
          this.loadReferences(id);
        },
        error: (error) => {
          this.handleOperationError(error, 'No fue posible eliminar la referencia.');
        }
      });
  }

  private loadClient(clientId: string): void {
    this.loadError = null;
    this.clientFormError = null;
    this.clientFormSubmitted = false;
    this.activeClientTab.set('general');
    this.isLoading = true;

    this.clientsApi
      .getClientById(clientId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (client) => {
          this.loadedClient.set(client);
          this.fillClientForm(client);
          if (!this.canUpdate()) {
            this.clientForm.disable({ emitEvent: false });
          }
          this.loadBeneficiaries(clientId);
          this.loadReferences(clientId);
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.loadError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
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
    this.clientForm.reset(
      {
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
      },
      { emitEvent: false }
    );
    this.applyPersonTypeRules(this.clientForm.controls.personType.value);
    this.applyClientNationalityRule(this.clientForm.controls.documentType.value);
  }

  private configurePersonTypeRules(): void {
    this.applyPersonTypeRules(this.clientForm.controls.personType.value);
    this.clientForm.controls.personType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((personType) => {
        this.applyPersonTypeRules(personType);
      });
  }

  private applyPersonTypeRules(personType: string): void {
    this.isJuridica.set(personType === 'Juridica');
    const control = this.clientForm.controls.lastName;
    if (personType === 'Natural') {
      control.setValidators([Validators.required, Validators.maxLength(256)]);
    } else {
      control.setValidators([Validators.maxLength(256)]);
    }
    control.updateValueAndValidity({ emitEvent: false });
  }

  private configureDocumentTypeRules(): void {
    this.applyClientNationalityRule(this.clientForm.controls.documentType.value);
    this.clientForm.controls.documentType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((documentType) => {
        this.onDocumentTypeChanged(this.clientForm.controls.nationality, documentType);
        this.applyClientNationalityRule(documentType);
      });

    this.applyBeneficiaryNationalityRule(this.beneficiaryForm.controls.documentType.value);
    this.beneficiaryForm.controls.documentType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((documentType) => {
        this.onDocumentTypeChanged(this.beneficiaryForm.controls.nationality, documentType);
        this.applyBeneficiaryNationalityRule(documentType);
      });
  }

  private applyClientNationalityRule(documentType: string): void {
    this.clientNationalityRequired.set(
      this.applyNationalityRule(this.clientForm.controls.nationality, documentType));
  }

  private applyBeneficiaryNationalityRule(documentType: string): void {
    this.beneficiaryNationalityRequired.set(
      this.applyNationalityRule(this.beneficiaryForm.controls.nationality, documentType));
  }

  // Reacción al cambio manual del tipo de documento: con DNI el campo queda oculto y se fija
  // el valor por defecto (siempre se envía); con Pasaporte se limpia para capturar la real.
  private onDocumentTypeChanged(control: FormControl<string>, documentType: string): void {
    if (documentType === 'Dni') {
      control.setValue(this.defaultNationality, { emitEvent: false });
    } else if (documentType === 'Passport') {
      control.setValue('', { emitEvent: false });
    }
  }

  // El campo solo se muestra con Pasaporte (retorna true). Con DNI permanece oculto pero con
  // el valor por defecto para que siempre se envíe. No muta un valor ya cargado de Pasaporte.
  private applyNationalityRule(control: FormControl<string>, documentType: string): boolean {
    const isPassport = documentType === 'Passport';
    control.setValidators(isPassport
      ? [Validators.required, Validators.maxLength(64)]
      : [Validators.maxLength(64)]);
    if (documentType === 'Dni' && control.value.trim() === '') {
      control.setValue(this.defaultNationality, { emitEvent: false });
    }
    control.updateValueAndValidity({ emitEvent: false });
    return isPassport;
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
      birthDate: this.cleanString(raw.birthDate),
      documentType: this.cleanString(raw.documentType),
      dni: this.cleanString(raw.dni),
      nationality: this.cleanString(raw.nationality),
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

  fieldInvalid(control: AbstractControl | null | undefined): boolean {
    return !!control && control.invalid && control.touched;
  }

  fieldErrorMessage(control: AbstractControl | null | undefined): string {
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
