import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
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
  ApplyPaymentRequest,
  ContractBalanceResponse,
  ContractInstallmentResponse,
  ContractLookupItem,
  GetPaymentsQuery,
  PagedResult,
  PaymentApplyResultResponse,
  PaymentDetailResponse,
  PaymentListItemResponse,
  RegisterPaymentRequest,
  VoidPaymentRequest
} from '../models/payments.models';
import { PaymentsApiService } from '../services/payments-api.service';

type AllocationFormGroup = FormGroup<{
  contractInstallmentId: FormControl<string>;
  installmentNumber: FormControl<number>;
  dueDate: FormControl<string>;
  remainingAmount: FormControl<number>;
  amountApplied: FormControl<number | null>;
}>;

@Component({
  selector: 'app-payments-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
  readonly canApply = computed(() => this.authSession.hasPermission('Payments.Apply'));
  readonly canVoid = computed(() => this.authSession.hasPermission('Payments.Void'));
  readonly canReview = computed(() => this.authSession.hasPermission('Payments.ReviewProof'));
  readonly canViewSchedule = computed(() => this.authSession.hasPermission('PaymentSchedules.View'));
  readonly canViewContracts = computed(() => this.authSession.hasPermission('Contracts.View'));
  readonly canViewClients = computed(() => this.authSession.hasPermission('Clients.View'));

  readonly paymentMethods = ['Efectivo', 'Transferencia'] as const;

  showCreditConfirm = false;
  creditConfirmAmount = 0;
  creditConfirmContext: 'register' | 'approve' = 'register';
  creditConfirmPaymentId: string | null = null;

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

  readonly filterForm = this.formBuilder.nonNullable.group({
    contractId: [''],
    clientId: [''],
    status: [''],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

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

  readonly applyForm = this.formBuilder.nonNullable.group({
    allocations: this.formBuilder.array<AllocationFormGroup>([])
  });

  readonly voidForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]]
  });

  readonly rejectForm = this.formBuilder.nonNullable.group({
    reason: ['', [Validators.required, Validators.maxLength(1024)]]
  });
  showRejectForm = false;
  rejectSubmitted = false;
  rejectError: string | null = null;

  payments: ReadonlyArray<PaymentListItemResponse> = [];
  contractPayments: ReadonlyArray<PaymentListItemResponse> = [];
  schedule: ReadonlyArray<ContractInstallmentResponse> = [];
  selectedPaymentDetail: PaymentDetailResponse | null = null;
  selectedContractBalance: ContractBalanceResponse | null = null;

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isFinanceLoading = false;

  clientClearSignal = 0;
  contractClearSignal = 0;
  registerClientClearSignal = 0;

  registerClientContracts: ReadonlyArray<ContractLookupItem> = [];
  isRegisterContractsLoading = false;

  showRegisterForm = false;
  showVoidForm = false;
  showApplyForm = false;

  registerSubmitted = false;
  voidSubmitted = false;
  applySubmitted = false;

  listError: string | null = null;
  registerError: string | null = null;
  detailError: string | null = null;
  financeError: string | null = null;
  voidError: string | null = null;
  applyError: string | null = null;

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

  get allocationsArray(): FormArray<AllocationFormGroup> {
    return this.applyForm.controls.allocations;
  }

  ngOnInit(): void {
    this.loadPayments(1);
  }

  applyFilters(): void {
    this.loadPayments(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      contractId: '',
      clientId: '',
      status: '',
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
            this.reloadAfterMutation({ page: 1 });
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
        next: (result) => this.handleApplyResult(result, 'register'),
        error: (error) => {
          const normalized = this.apiErrorService.normalize(error);
          this.registerError = normalized.userMessage;
          this.feedback.showError(normalized.userMessage);
        }
      });
  }

  private handleApplyResult(result: PaymentApplyResultResponse, context: 'register' | 'approve'): void {
    if (result.requiresCreditConfirmation) {
      this.creditConfirmAmount = result.projectedCreditBalance;
      this.creditConfirmContext = context;
      // En 'register' aún no hay paymentId; en 'approve' lo setea el método approve antes de llamar.
      if (context === 'register') {
        this.showRegisterForm = false;
      }
      this.showCreditConfirm = true;
      return;
    }

    if (context === 'register') {
      const message = result.payment?.status === 'Aplicado'
        ? 'Pago aplicado y recibo emitido.'
        : 'Pago registrado. Queda pendiente de aprobacion.';
      this.feedback.showSuccess(message);
      this.cancelRegisterForm();
    } else {
      this.showRejectForm = false;
      this.feedback.showSuccess('Pago aprobado: aplicado y recibo emitido.');
    }
    this.reloadAfterMutation({ page: context === 'register' ? 1 : this.currentPage, paymentId: result.payment?.id ?? undefined });
  }

  confirmCreditBalance(): void {
    this.showCreditConfirm = false;
    if (this.creditConfirmContext === 'register') {
      this.submitRegisterPayment(true);
    } else if (this.creditConfirmPaymentId) {
      this.approvePayment(this.creditConfirmPaymentId, true);
    }
  }

  cancelCreditConfirm(): void {
    this.showCreditConfirm = false;
    this.creditConfirmPaymentId = null;
    if (this.creditConfirmContext === 'register') {
      this.showRegisterForm = true;
    }
  }

  approvePayment(paymentId: string, confirmCreditBalance = false): void {
    this.creditConfirmPaymentId = paymentId;
    this.isSubmitting = true;
    this.paymentsApi
      .approvePayment(paymentId, { confirmCreditBalance })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.isSubmitting = false; this.changeDetectorRef.markForCheck(); }))
      .subscribe({
        next: (result) => this.handleApplyResult(result, 'approve'),
        error: (error) => {
          const normalized = this.apiErrorService.normalize(error);
          this.feedback.showError(normalized.userMessage);
        }
      });
  }

  openRejectForm(): void {
    this.rejectSubmitted = false;
    this.rejectError = null;
    this.rejectForm.reset({ reason: '' });
    this.showRejectForm = true;
  }

  cancelRejectForm(): void {
    this.showRejectForm = false;
    this.rejectError = null;
  }

  submitRejectPayment(): void {
    this.rejectSubmitted = true;
    this.rejectError = null;
    const paymentId = this.selectedPaymentDetail?.id;
    if (!paymentId || this.rejectForm.invalid) {
      this.rejectForm.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.paymentsApi
      .rejectPayment(paymentId, { reason: this.rejectForm.getRawValue().reason })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.isSubmitting = false; this.changeDetectorRef.markForCheck(); }))
      .subscribe({
        next: () => {
          this.feedback.showSuccess('Pago rechazado.');
          this.cancelRejectForm();
          this.reloadAfterMutation({ page: this.currentPage, paymentId });
        },
        error: (error) => {
          const normalized = this.apiErrorService.normalize(error);
          this.rejectError = normalized.userMessage;
          this.feedback.showError(normalized.userMessage);
        }
      });
  }

  viewPaymentDetail(paymentId: string): void {
    this.detailError = null;
    this.financeError = null;
    this.selectedPaymentDetail = null;
    this.selectedContractBalance = null;
    this.schedule = [];
    this.contractPayments = [];
    this.showApplyForm = false;
    this.showVoidForm = false;
    this.isDetailLoading = true;

    this.paymentsApi
      .getPaymentById(paymentId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isDetailLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.selectedPaymentDetail = response;
          if (response.contractId) {
            this.loadContractFinance(response.contractId);
          }
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.detailError = normalizedError.userMessage;
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  openApplyForm(): void {
    if (!this.selectedPaymentDetail?.contractId) {
      this.applyError = 'Este pago no tiene contrato asociado; no se puede aplicar a cuotas.';
      return;
    }

    if (this.selectedPaymentDetail.status === 'Anulado') {
      this.applyError = 'No puedes aplicar un pago anulado.';
      return;
    }

    this.showApplyForm = true;
    this.applySubmitted = false;
    this.applyError = null;
    this.initializeApplyFormFromSchedule();
  }

  cancelApplyForm(): void {
    this.showApplyForm = false;
    this.applySubmitted = false;
    this.applyError = null;
    this.allocationsArray.clear();
  }

  submitApplyPayment(): void {
    if (!this.selectedPaymentDetail) {
      return;
    }

    this.applySubmitted = true;
    this.applyError = null;

    const rows = this.allocationsArray.controls.map((group) => group.getRawValue());
    const selectedRows = rows.filter((row) => row.amountApplied !== null && row.amountApplied > 0);

    if (selectedRows.length === 0) {
      this.applyError = 'Debes indicar al menos una cuota con monto aplicado mayor que cero.';
      return;
    }

    const invalidRow = selectedRows.find((row) => row.amountApplied! <= 0 || row.amountApplied! > row.remainingAmount);
    if (invalidRow) {
      this.applyError = 'Hay montos aplicados invalidos. Verifica que sean mayores que cero y no excedan el saldo de cuota.';
      return;
    }

    const payload: ApplyPaymentRequest = {
      allocations: selectedRows.map((row) => ({
        contractInstallmentId: row.contractInstallmentId,
        amountApplied: Number(row.amountApplied)
      }))
    };

    const confirmed = globalThis.confirm(
      `Se aplicaran ${payload.allocations.length} cuotas al pago ${this.selectedPaymentDetail.paymentNumber}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    this.isSubmitting = true;
    this.paymentsApi
      .applyPayment(this.selectedPaymentDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Pago aplicado correctamente.' });
          this.showApplyForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            paymentId: response.id,
            contractId: response.contractId ?? undefined
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.applyError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al aplicar pago: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  openVoidForm(): void {
    if (!this.selectedPaymentDetail) {
      return;
    }

    this.showVoidForm = true;
    this.voidSubmitted = false;
    this.voidError = null;
    this.voidForm.reset({ reason: '' });
  }

  cancelVoidForm(): void {
    this.showVoidForm = false;
    this.voidSubmitted = false;
    this.voidError = null;
  }

  submitVoidPayment(): void {
    if (!this.selectedPaymentDetail) {
      return;
    }

    this.voidSubmitted = true;
    this.voidError = null;
    if (this.voidForm.invalid) {
      this.voidForm.markAllAsTouched();
      return;
    }

    const confirmed = globalThis.confirm(
      `Se anulara el pago ${this.selectedPaymentDetail.paymentNumber}. Deseas continuar?`
    );
    if (!confirmed) {
      return;
    }

    const payload: VoidPaymentRequest = {
      reason: this.cleanString(this.voidForm.controls.reason.value)
    };

    this.isSubmitting = true;
    this.paymentsApi
      .voidPayment(this.selectedPaymentDetail.id, payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Pago anulado correctamente.' });
          this.showVoidForm = false;
          this.reloadAfterMutation({
            page: this.currentPage,
            paymentId: response.id,
            contractId: response.contractId ?? undefined
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.voidError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al anular pago: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
        }
      });
  }

  private reloadAfterMutation(options: { page: number; paymentId?: string; contractId?: string }): void {
    this.loadPayments(options.page);
    if (options.paymentId) {
      this.viewPaymentDetail(options.paymentId);
      return;
    }

    if (options.contractId) {
      this.loadContractFinance(options.contractId);
    }
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

  private loadContractFinance(contractId: string): void {
    this.financeError = null;
    this.isFinanceLoading = true;
    this.schedule = [];
    this.contractPayments = [];
    this.selectedContractBalance = null;

    this.paymentsApi
      .getContractSchedule(contractId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.schedule = response;
          if (this.showApplyForm) {
            this.initializeApplyFormFromSchedule();
          }
          this.syncView();
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.financeError = normalizedError.userMessage;
          this.schedule = [];
          this.syncView();
        }
      });

    this.paymentsApi
      .getContractPayments(contractId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.contractPayments = response;
          this.syncView();
        },
        error: () => {
          this.contractPayments = [];
          this.syncView();
        }
      });

    this.paymentsApi
      .getContractBalance(contractId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isFinanceLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.selectedContractBalance = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.financeError = normalizedError.userMessage;
          this.selectedContractBalance = null;
        }
      });
  }

  private initializeApplyFormFromSchedule(): void {
    this.allocationsArray.clear();
    for (const installment of this.schedule) {
      this.allocationsArray.push(this.buildAllocationGroup(installment));
    }
  }

  private buildAllocationGroup(installment: ContractInstallmentResponse): AllocationFormGroup {
    return new FormGroup({
      contractInstallmentId: new FormControl<string>(installment.id, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      installmentNumber: new FormControl<number>(installment.installmentNumber, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      dueDate: new FormControl<string>(installment.dueDate, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      remainingAmount: new FormControl<number>(installment.remainingAmount, {
        nonNullable: true,
        validators: [Validators.required]
      }),
      amountApplied: new FormControl<number | null>(null, {
        validators: [Validators.min(0), Validators.max(installment.remainingAmount)]
      })
    });
  }

  private toRegisterPaymentPayload(): RegisterPaymentRequest {
    const raw = this.registerForm.getRawValue();
    return {
      contractId: this.cleanString(raw.contractId),
      clientId: this.cleanString(raw.clientId),
      paymentDate: raw.paymentDate,
      amount: Number(raw.amount),
      currency: this.cleanString(raw.currency) ?? 'HNL',
      paymentMethod: this.cleanString(raw.paymentMethod),
      bankName: this.cleanString(raw.bankName),
      transactionReference: this.cleanString(raw.transactionReference),
      concept: this.cleanString(raw.concept),
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
