import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, map } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { SearchSelectComponent, SearchSelectOption } from '../../../shared/components/search-select/search-select';
import {
  ContractLookupItem,
  GetPaymentsQuery,
  PagedResult,
  PaymentApplyResultResponse,
  PaymentListItemResponse,
  RegisterPaymentRequest
} from '../models/payments.models';
import { PaymentsApiService } from '../services/payments-api.service';

function dateRangeValidator(group: AbstractControl): ValidationErrors | null {
  const from = group.get('fromDate')?.value as string;
  const to = group.get('toDate')?.value as string;
  if (from && to && from > to) {
    return { dateRange: true };
  }
  return null;
}

@Component({
  selector: 'app-payments-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    AppModalComponent,
    LoadingStateComponent,
    EmptyStateComponent,
    HasPermissionDirective,
    PaginationComponent,
    SearchSelectComponent
  ],
  templateUrl: './payments-page.component.html',
  styleUrl: './payments-page.component.scss'
})
export class PaymentsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly paymentsApi = inject(PaymentsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canRegister = computed(() => this.authSession.hasPermission('Payments.Register'));
  readonly canViewContracts = computed(() => this.authSession.hasPermission('Contracts.View'));
  readonly canViewClients = computed(() => this.authSession.hasPermission('Clients.View'));

  readonly paymentMethods = ['Efectivo', 'Transferencia'] as const;

  showCreditConfirm = false;
  creditConfirmAmount = 0;

  selectedProofFile: File | null = null;

  onProofFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedProofFile = input.files?.[0] ?? null;
  }

  get isTransferMethod(): boolean {
    return this.registerForm.controls.paymentMethod.value === 'Transferencia';
  }

  readonly paymentStatuses: ReadonlyArray<string> = [
    'Registrado',
    'Aplicado',
    'PendienteRevision',
    'Rechazado',
    'Anulado'
  ];

  readonly filterForm = this.formBuilder.nonNullable.group(
    {
      contractId: [''],
      clientId: [''],
      status: ['PendienteRevision'],
      fromDate: [''],
      toDate: [''],
      pageSize: [20, [Validators.min(1), Validators.max(200)]]
    },
    { validators: dateRangeValidator }
  );

  readonly registerForm = this.formBuilder.nonNullable.group({
    contractId: [''],
    clientId: [''],
    paymentDate: [this.todayString(), [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['HNL', [Validators.maxLength(16)]],
    paymentMethod: ['Efectivo', [Validators.required]],
    bankName: ['', [Validators.maxLength(128)]],
    transactionReference: ['', [Validators.maxLength(128)]],
    concept: ['', [Validators.maxLength(256)]],
    notes: ['', [Validators.maxLength(2048)]]
  });

  payments: ReadonlyArray<PaymentListItemResponse> = [];

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;

  clientClearSignal = 0;
  contractClearSignal = 0;
  registerClientClearSignal = 0;

  registerClientContracts: ReadonlyArray<ContractLookupItem> = [];
  isRegisterContractsLoading = false;

  showRegisterForm = false;

  registerSubmitted = false;

  listError: string | null = null;
  registerError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    const pages = Math.ceil(this.totalCount / pageSize);
    return Math.max(1, pages);
  });

  readonly searchClientsFn = (query: string) =>
    this.paymentsApi
      .getClientsLookup({ page: 1, pageSize: 10, search: query })
      .pipe(
        map((result) =>
          result.items.map((client) => ({
            id: client.id,
            label: client.fullName,
            sublabel: client.dni || client.rtn || undefined
          } as SearchSelectOption))
        )
      );

  readonly searchContractsFn = (query: string) =>
    this.paymentsApi
      .getContractsLookup({ page: 1, pageSize: 10, search: query })
      .pipe(
        map((result) =>
          result.items.map((contract) => ({
            id: contract.id,
            label: contract.contractNumber,
            sublabel: contract.clientFullName || undefined
          } as SearchSelectOption))
        )
      );

  onClientSelected(option: SearchSelectOption | null): void {
    this.filterForm.controls.clientId.setValue(option?.id ?? '');
    this.applyFilters();
  }

  onContractSelected(option: SearchSelectOption | null): void {
    this.filterForm.controls.contractId.setValue(option?.id ?? '');
    this.applyFilters();
  }

  onRegisterClientSelected(option: SearchSelectOption | null): void {
    this.registerForm.controls.clientId.setValue(option?.id ?? '');
    this.registerForm.controls.contractId.setValue('');
    this.registerClientContracts = [];

    if (option) {
      this.loadRegisterClientContracts(option.id);
    } else {
      this.registerForm.controls.contractId.disable();
    }
  }

  hasRegisterControlError(controlName: string): boolean {
    const control = this.registerForm.get(controlName);
    return !!control && control.invalid && (control.touched || this.registerSubmitted);
  }

  getRegisterControlErrorMessage(controlName: string): string {
    const control = this.registerForm.get(controlName);
    if (!control?.errors || (!control.touched && !this.registerSubmitted)) {
      return '';
    }

    if (control.errors['required']) return 'Este campo es obligatorio.';
    if (control.errors['min']) return 'Ingresa un valor mayor que 0.';
    if (control.errors['maxlength']) return 'Supera la longitud permitida.';
    return 'Valor invalido.';
  }

  hasRegisterReferences(): boolean {
    const contractId = this.registerForm.controls.contractId.value?.trim();
    const clientId = this.registerForm.controls.clientId.value?.trim();
    return !!(contractId || clientId);
  }

  ngOnInit(): void {
    this.loadPayments(1);
  }

  applyFilters(): void {
    if (this.filterForm.errors?.['dateRange']) {
      return;
    }
    this.loadPayments(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      contractId: '',
      clientId: '',
      status: 'PendienteRevision',
      fromDate: '',
      toDate: '',
      pageSize: 20
    });
    this.clientClearSignal++;
    this.contractClearSignal++;
    this.loadPayments(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadPayments(1);
  }

  openRegisterForm(): void {
    this.showRegisterForm = true;
    this.registerSubmitted = false;
    this.registerError = null;
    this.registerForm.reset({
      contractId: '',
      clientId: '',
      paymentDate: this.todayString(),
      amount: 0,
      currency: 'HNL',
      paymentMethod: 'Efectivo',
      bankName: '',
      transactionReference: '',
      concept: '',
      notes: ''
    });
    this.registerClientClearSignal++;
    this.registerClientContracts = [];
    this.registerForm.controls.contractId.disable();
    this.selectedProofFile = null;
  }

  cancelRegisterForm(): void {
    this.showRegisterForm = false;
    this.registerSubmitted = false;
    this.registerError = null;
    this.selectedProofFile = null;
  }

  submitRegisterPayment(confirmCreditBalance = false): void {
    this.registerSubmitted = true;
    this.registerError = null;
    if (this.registerForm.invalid || !this.hasRegisterReferences()) {
      this.registerForm.markAllAsTouched();
      return;
    }

    if (this.isTransferMethod) {
      if (!this.selectedProofFile) {
        this.registerError = 'Debes adjuntar el comprobante de la transferencia.';
        return;
      }
      const raw = this.registerForm.getRawValue();
      const fd = new FormData();
      if (raw.contractId) fd.append('contractId', raw.contractId);
      if (raw.clientId) fd.append('clientId', raw.clientId);
      fd.append('paymentDate', raw.paymentDate);
      fd.append('amount', String(raw.amount));
      fd.append('currency', raw.currency ?? 'HNL');
      if (raw.bankName) fd.append('bankName', raw.bankName);
      if (raw.transactionReference) fd.append('transactionReference', raw.transactionReference);
      if (raw.concept) fd.append('concept', raw.concept);
      if (raw.notes) fd.append('notes', raw.notes);
      fd.append('file', this.selectedProofFile);

      this.isSubmitting = true;
      this.paymentsApi.registerTransferPayment(fd)
        .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.isSubmitting = false; this.changeDetectorRef.markForCheck(); }))
        .subscribe({
          next: () => {
            this.feedback.showSuccess('Transferencia registrada. Queda pendiente de aprobacion.');
            this.cancelRegisterForm();
            this.loadPayments(1);
          },
          error: (error) => {
            const normalized = this.apiErrorService.normalize(error);
            this.registerError = normalized.userMessage;
            this.feedback.showError(normalized.userMessage);
          }
        });
      return;
    }

    const raw = this.registerForm.getRawValue();
    const request: RegisterPaymentRequest = {
      contractId: raw.contractId || null,
      clientId: raw.clientId || null,
      paymentDate: raw.paymentDate,
      amount: raw.amount,
      currency: raw.currency || null,
      paymentMethod: raw.paymentMethod,
      bankName: raw.bankName || null,
      transactionReference: raw.transactionReference || null,
      concept: raw.concept || null,
      notes: raw.notes || null,
      confirmCreditBalance
    };

    this.isSubmitting = true;
    this.paymentsApi
      .registerPayment(request)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.isSubmitting = false; this.changeDetectorRef.markForCheck(); }))
      .subscribe({
        next: (result) => this.handleApplyResult(result),
        error: (error) => {
          const normalized = this.apiErrorService.normalize(error);
          this.registerError = normalized.userMessage;
          this.feedback.showError(normalized.userMessage);
        }
      });
  }

  private handleApplyResult(result: PaymentApplyResultResponse): void {
    if (result.requiresCreditConfirmation) {
      this.creditConfirmAmount = result.projectedCreditBalance;
      this.showRegisterForm = false;
      this.showCreditConfirm = true;
      return;
    }

    const message = result.payment?.status === 'Aplicado'
      ? 'Pago aplicado y recibo emitido.'
      : 'Pago registrado. Queda pendiente de aprobacion.';
    this.feedback.showSuccess(message);
    this.cancelRegisterForm();
    this.loadPayments(1);
  }

  confirmCreditBalance(): void {
    this.showCreditConfirm = false;
    this.submitRegisterPayment(true);
  }

  cancelCreditConfirm(): void {
    this.showCreditConfirm = false;
    this.showRegisterForm = true;
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Aplicado':
        return 'status-badge applied';
      case 'PendienteRevision':
        return 'status-badge pending';
      case 'Rechazado':
      case 'Anulado':
        return 'status-badge blocked';
      default:
        return 'status-badge';
    }
  }

  resolveContractLabel(contractId: string | null | undefined): string {
    return contractId ?? '-';
  }

  resolveClientLabel(clientId: string | null | undefined): string {
    return clientId ?? '-';
  }

  protected loadPayments(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetPaymentsQuery = {
      contractId: this.cleanString(this.filterForm.controls.contractId.value),
      clientId: this.cleanString(this.filterForm.controls.clientId.value),
      status: this.cleanString(this.filterForm.controls.status.value),
      fromDate: this.cleanString(this.filterForm.controls.fromDate.value),
      toDate: this.cleanString(this.filterForm.controls.toDate.value),
      page,
      pageSize: this.filterForm.controls.pageSize.value
    };

    this.paymentsApi
      .getPayments(query)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response: PagedResult<PaymentListItemResponse>) => {
          this.payments = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.listError = normalizedError.userMessage;
        }
      });
  }

  private loadRegisterClientContracts(clientId: string): void {
    this.isRegisterContractsLoading = true;
    this.registerForm.controls.contractId.disable();

    this.paymentsApi
      .getContractsLookup({ page: 1, pageSize: 50, clientId })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isRegisterContractsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.registerClientContracts = response.items;
          this.registerForm.controls.contractId.enable();
          this.syncView();
        },
        error: () => {
          this.registerClientContracts = [];
          this.syncView();
        }
      });
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
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
