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
import { finalize } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { AppModalComponent } from '../../../shared/components/app-modal/app-modal.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import {
  ApplyPaymentRequest,
  ClientLookupItem,
  ContractBalanceResponse,
  ContractInstallmentResponse,
  ContractLookupItem,
  GetPaymentsQuery,
  PagedResult,
  PaymentDetailResponse,
  PaymentListItemResponse,
  RegisterPaymentRequest,
  VoidPaymentRequest
} from '../models/payments.models';
import { PaymentsApiService } from '../services/payments-api.service';

const LOOKUP_PAGE_SIZE = 100;

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
    HasPermissionDirective
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
  readonly canViewSchedule = computed(() => this.authSession.hasPermission('PaymentSchedules.View'));
  readonly canViewContracts = computed(() => this.authSession.hasPermission('Contracts.View'));
  readonly canViewClients = computed(() => this.authSession.hasPermission('Clients.View'));

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
    search: ['', [Validators.maxLength(256)]],
    fromDate: [''],
    toDate: [''],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly registerForm = this.formBuilder.nonNullable.group({
    contractId: [''],
    clientId: [''],
    paymentDate: [this.todayString(), [Validators.required]],
    amount: [0, [Validators.required, Validators.min(0.01)]],
    currency: ['HNL', [Validators.maxLength(16)]],
    paymentMethod: ['', [Validators.maxLength(64)]],
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

  payments: ReadonlyArray<PaymentListItemResponse> = [];
  contractPayments: ReadonlyArray<PaymentListItemResponse> = [];
  contractOptions: ReadonlyArray<ContractLookupItem> = [];
  clientOptions: ReadonlyArray<ClientLookupItem> = [];
  schedule: ReadonlyArray<ContractInstallmentResponse> = [];
  selectedPaymentDetail: PaymentDetailResponse | null = null;
  selectedContractBalance: ContractBalanceResponse | null = null;

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;
  isDetailLoading = false;
  isFinanceLoading = false;
  isLookupLoading = false;

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

  hasRegisterReferences(): boolean {
    const contractId = this.registerForm.controls.contractId.value?.trim();
    const clientId = this.registerForm.controls.clientId.value?.trim();
    return !!(contractId || clientId);
  }

  get allocationsArray(): FormArray<AllocationFormGroup> {
    return this.applyForm.controls.allocations;
  }

  ngOnInit(): void {
    this.loadLookupOptions();
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
      search: '',
      fromDate: '',
      toDate: '',
      pageSize: 20
    });
    this.loadPayments(1);
  }

  goToPreviousPage(): void {
    if (this.currentPage <= 1) {
      return;
    }
    this.loadPayments(this.currentPage - 1);
  }

  goToNextPage(): void {
    if (this.currentPage >= this.totalPages()) {
      return;
    }
    this.loadPayments(this.currentPage + 1);
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
      paymentMethod: '',
      bankName: '',
      transactionReference: '',
      concept: '',
      notes: ''
    });
  }

  cancelRegisterForm(): void {
    this.showRegisterForm = false;
    this.registerSubmitted = false;
    this.registerError = null;
  }

  submitRegisterPayment(): void {
    this.registerSubmitted = true;
    this.registerError = null;

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    if (!this.hasRegisterReferences()) {
      this.registerError = 'Debes seleccionar al menos contrato o cliente para registrar el pago.';
      return;
    }

    const payload = this.toRegisterPaymentPayload();
    this.isSubmitting = true;

    this.paymentsApi
      .registerPayment(payload)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSubmitting = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.feedback.show({ level: 'success', text: 'Pago registrado correctamente.' });
          this.cancelRegisterForm();
          this.reloadAfterMutation({
            page: 1,
            paymentId: response.id,
            contractId: response.contractId ?? undefined
          });
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.registerError = normalizedError.userMessage;
          if (normalizedError.status === 409) {
            this.feedback.showError(`Conflicto al registrar pago: ${normalizedError.userMessage}`);
            return;
          }
          this.feedback.showError(normalizedError.userMessage);
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
    if (!contractId) {
      return '-';
    }

    const option = this.contractOptions.find((item) => item.id === contractId);
    return option ? option.contractNumber : contractId;
  }

  resolveClientLabel(clientId: string | null | undefined): string {
    if (!clientId) {
      return '-';
    }

    const option = this.clientOptions.find((item) => item.id === clientId);
    return option ? option.fullName : clientId;
  }

  private loadPayments(page: number): void {
    this.listError = null;
    this.isLoading = true;

    const query: GetPaymentsQuery = {
      contractId: this.cleanString(this.filterForm.controls.contractId.value),
      clientId: this.cleanString(this.filterForm.controls.clientId.value),
      status: this.cleanString(this.filterForm.controls.status.value),
      search: this.cleanString(this.filterForm.controls.search.value),
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

  private loadLookupOptions(): void {
    this.isLookupLoading = true;

    this.paymentsApi
      .getContractsLookup({
        page: 1,
        pageSize: LOOKUP_PAGE_SIZE,
        status: null,
        search: null,
        projectId: null,
        lotId: null,
        clientId: null,
        fromDate: null,
        toDate: null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.contractOptions = response.items;
          this.syncView();
        },
        error: () => {
          this.contractOptions = [];
          this.syncView();
        }
      });

    this.paymentsApi
      .getClientsLookup({
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
          this.syncView();
        },
        error: () => {
          this.clientOptions = [];
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
