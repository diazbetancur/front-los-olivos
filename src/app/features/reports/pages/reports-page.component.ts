import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import {
  AuditLogListItemResponse,
  ClientLookupItem,
  ContractInArrearsResponse,
  ContractLookupItem,
  ContractStatusSummaryResponse,
  LotStatusSummaryResponse,
  PaymentsByDateRangeResponse,
  ProjectBalanceSummaryResponse,
  ProjectLookupItem,
  VoidedReceiptResponse
} from '../models/reports.models';
import { ReportsApiService } from '../services/reports-api.service';

const LOOKUP_PAGE_SIZE = 100;

@Component({
  selector: 'app-reports-page',
  imports: [CommonModule, ReactiveFormsModule, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './reports-page.component.html',
  styleUrl: './reports-page.component.scss'
})
export class ReportsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly reportsApi = inject(ReportsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly authSession = inject(AuthSessionService);

  readonly canViewReports = computed(() => this.authSession.hasPermission('Reports.View'));
  readonly canViewAudit = computed(() => this.authSession.hasPermission('Audit.View'));
  readonly Math = Math;

  readonly summaryFilterForm = this.formBuilder.nonNullable.group({
    projectId: [''],
    fromDate: [''],
    toDate: ['']
  });

  readonly arrearsFilterForm = this.formBuilder.nonNullable.group({
    asOfDate: [this.todayString()],
    upcomingDays: [7, [Validators.min(0), Validators.max(180)]],
    projectId: [''],
    search: ['', [Validators.maxLength(256)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly paymentsFilterForm = this.formBuilder.nonNullable.group({
    fromDate: [this.startOfMonthString()],
    toDate: [this.todayString()],
    contractId: [''],
    clientId: [''],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly balancesFilterForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(256)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly voidedReceiptsFilterForm = this.formBuilder.nonNullable.group({
    fromDate: [''],
    toDate: [''],
    search: ['', [Validators.maxLength(256)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  readonly auditFilterForm = this.formBuilder.nonNullable.group({
    fromUtc: [''],
    toUtc: [''],
    userName: ['', [Validators.maxLength(256)]],
    entityName: ['', [Validators.maxLength(256)]],
    action: ['', [Validators.maxLength(128)]],
    pageSize: [20, [Validators.min(1), Validators.max(200)]]
  });

  projectOptions: ReadonlyArray<ProjectLookupItem> = [];
  contractOptions: ReadonlyArray<ContractLookupItem> = [];
  clientOptions: ReadonlyArray<ClientLookupItem> = [];

  lotSummary: ReadonlyArray<LotStatusSummaryResponse> = [];
  contractSummary: ReadonlyArray<ContractStatusSummaryResponse> = [];
  arrearsItems: ReadonlyArray<ContractInArrearsResponse> = [];
  paymentsReport: PaymentsByDateRangeResponse | null = null;
  balanceItems: ReadonlyArray<ProjectBalanceSummaryResponse> = [];
  voidedReceiptItems: ReadonlyArray<VoidedReceiptResponse> = [];
  auditItems: ReadonlyArray<AuditLogListItemResponse> = [];

  arrearsPage = 1;
  arrearsTotalCount = 0;
  balancesPage = 1;
  balancesTotalCount = 0;
  voidedReceiptsPage = 1;
  voidedReceiptsTotalCount = 0;
  auditPage = 1;
  auditTotalCount = 0;

  isLookupLoading = false;
  isSummaryLoading = false;
  isArrearsLoading = false;
  isPaymentsLoading = false;
  isBalancesLoading = false;
  isVoidedReceiptsLoading = false;
  isAuditLoading = false;

  summaryError: string | null = null;
  arrearsError: string | null = null;
  paymentsError: string | null = null;
  balancesError: string | null = null;
  voidedReceiptsError: string | null = null;
  auditError: string | null = null;

  ngOnInit(): void {
    this.loadLookupOptions();

    if (this.canViewReports()) {
      this.loadSummary();
      this.loadArrears(1);
      this.loadPayments(1);
      this.loadProjectBalances(1);
      this.loadVoidedReceipts(1);
    }

    if (this.canViewAudit()) {
      this.loadAuditLogs(1);
    }
  }

  refreshSummary(): void {
    this.loadSummary();
  }

  applyArrearsFilters(): void {
    this.loadArrears(1);
  }

  goToPreviousArrearsPage(): void {
    if (this.arrearsPage <= 1) {
      return;
    }
    this.loadArrears(this.arrearsPage - 1);
  }

  goToNextArrearsPage(): void {
    if (this.arrearsPage >= this.totalPages(this.arrearsTotalCount, this.arrearsFilterForm.controls.pageSize.value)) {
      return;
    }
    this.loadArrears(this.arrearsPage + 1);
  }

  applyPaymentsFilters(): void {
    this.loadPayments(1);
  }

  goToPreviousPaymentsPage(): void {
    const page = this.paymentsReport?.page ?? 1;
    if (page <= 1) {
      return;
    }
    this.loadPayments(page - 1);
  }

  goToNextPaymentsPage(): void {
    const report = this.paymentsReport;
    if (!report) {
      return;
    }

    const totalPages = this.totalPages(report.totalCount, report.pageSize);
    if (report.page >= totalPages) {
      return;
    }
    this.loadPayments(report.page + 1);
  }

  applyBalancesFilters(): void {
    this.loadProjectBalances(1);
  }

  goToPreviousBalancesPage(): void {
    if (this.balancesPage <= 1) {
      return;
    }
    this.loadProjectBalances(this.balancesPage - 1);
  }

  goToNextBalancesPage(): void {
    if (this.balancesPage >= this.totalPages(this.balancesTotalCount, this.balancesFilterForm.controls.pageSize.value)) {
      return;
    }
    this.loadProjectBalances(this.balancesPage + 1);
  }

  applyVoidedReceiptsFilters(): void {
    this.loadVoidedReceipts(1);
  }

  goToPreviousVoidedReceiptsPage(): void {
    if (this.voidedReceiptsPage <= 1) {
      return;
    }
    this.loadVoidedReceipts(this.voidedReceiptsPage - 1);
  }

  goToNextVoidedReceiptsPage(): void {
    if (
      this.voidedReceiptsPage >=
      this.totalPages(this.voidedReceiptsTotalCount, this.voidedReceiptsFilterForm.controls.pageSize.value)
    ) {
      return;
    }
    this.loadVoidedReceipts(this.voidedReceiptsPage + 1);
  }

  applyAuditFilters(): void {
    this.loadAuditLogs(1);
  }

  goToPreviousAuditPage(): void {
    if (this.auditPage <= 1) {
      return;
    }
    this.loadAuditLogs(this.auditPage - 1);
  }

  goToNextAuditPage(): void {
    if (this.auditPage >= this.totalPages(this.auditTotalCount, this.auditFilterForm.controls.pageSize.value)) {
      return;
    }
    this.loadAuditLogs(this.auditPage + 1);
  }

  lotStatusClass(status: string): string {
    switch (status) {
      case 'Disponible':
        return 'status-badge status-available';
      case 'Reservado':
        return 'status-badge status-warning';
      case 'Contratado':
      case 'Pagado':
        return 'status-badge status-success';
      case 'Bloqueado':
      case 'Anulado':
        return 'status-badge status-danger';
      default:
        return 'status-badge';
    }
  }

  contractStatusClass(status: string): string {
    switch (status) {
      case 'Activo':
      case 'Pagado':
      case 'Cerrado':
        return 'status-badge status-success';
      case 'EnMora':
        return 'status-badge status-danger';
      case 'PendienteFirma':
      case 'Borrador':
        return 'status-badge status-warning';
      default:
        return 'status-badge';
    }
  }

  paymentStatusClass(status: string): string {
    switch (status) {
      case 'Aplicado':
      case 'Registrado':
        return 'status-badge status-success';
      case 'PendienteRevision':
        return 'status-badge status-warning';
      case 'Rechazado':
      case 'Anulado':
        return 'status-badge status-danger';
      default:
        return 'status-badge';
    }
  }

  receiptStatusClass(): string {
    return 'status-badge status-danger';
  }

  private loadLookupOptions(): void {
    this.isLookupLoading = true;

    this.reportsApi
      .getProjectsLookup({
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

    this.reportsApi
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

    this.reportsApi
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

  private loadSummary(): void {
    this.summaryError = null;
    this.isSummaryLoading = true;

    const projectId = this.cleanString(this.summaryFilterForm.controls.projectId.value);
    const fromDate = this.cleanString(this.summaryFilterForm.controls.fromDate.value);
    const toDate = this.cleanString(this.summaryFilterForm.controls.toDate.value);

    this.reportsApi
      .getLotStatusSummary(projectId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.lotSummary = response;
          this.syncView();
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.summaryError = normalizedError.userMessage;
          this.lotSummary = [];
          this.syncView();
        }
      });

    this.reportsApi
      .getContractStatusSummary({ projectId, fromDate, toDate })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isSummaryLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.contractSummary = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.summaryError = normalizedError.userMessage;
          this.contractSummary = [];
        }
      });
  }

  private loadArrears(page: number): void {
    this.arrearsError = null;
    this.isArrearsLoading = true;

    this.reportsApi
      .getContractsInArrears({
        asOfDate: this.cleanString(this.arrearsFilterForm.controls.asOfDate.value),
        upcomingDays: this.arrearsFilterForm.controls.upcomingDays.value,
        projectId: this.cleanString(this.arrearsFilterForm.controls.projectId.value),
        search: this.cleanString(this.arrearsFilterForm.controls.search.value),
        page,
        pageSize: this.arrearsFilterForm.controls.pageSize.value
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isArrearsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.arrearsItems = response.items;
          this.arrearsPage = response.page;
          this.arrearsTotalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.arrearsError = normalizedError.userMessage;
          this.arrearsItems = [];
        }
      });
  }

  private loadPayments(page: number): void {
    this.paymentsError = null;
    this.isPaymentsLoading = true;

    this.reportsApi
      .getPaymentsByDateRange({
        fromDate: this.cleanString(this.paymentsFilterForm.controls.fromDate.value),
        toDate: this.cleanString(this.paymentsFilterForm.controls.toDate.value),
        contractId: this.cleanString(this.paymentsFilterForm.controls.contractId.value),
        clientId: this.cleanString(this.paymentsFilterForm.controls.clientId.value),
        page,
        pageSize: this.paymentsFilterForm.controls.pageSize.value
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isPaymentsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.paymentsReport = response;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.paymentsError = normalizedError.userMessage;
          this.paymentsReport = null;
        }
      });
  }

  private loadProjectBalances(page: number): void {
    this.balancesError = null;
    this.isBalancesLoading = true;

    this.reportsApi
      .getProjectBalances({
        search: this.cleanString(this.balancesFilterForm.controls.search.value),
        page,
        pageSize: this.balancesFilterForm.controls.pageSize.value
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isBalancesLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.balanceItems = response.items;
          this.balancesPage = response.page;
          this.balancesTotalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.balancesError = normalizedError.userMessage;
          this.balanceItems = [];
        }
      });
  }

  private loadVoidedReceipts(page: number): void {
    this.voidedReceiptsError = null;
    this.isVoidedReceiptsLoading = true;

    this.reportsApi
      .getVoidedReceipts({
        fromDate: this.cleanString(this.voidedReceiptsFilterForm.controls.fromDate.value),
        toDate: this.cleanString(this.voidedReceiptsFilterForm.controls.toDate.value),
        search: this.cleanString(this.voidedReceiptsFilterForm.controls.search.value),
        page,
        pageSize: this.voidedReceiptsFilterForm.controls.pageSize.value
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isVoidedReceiptsLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.voidedReceiptItems = response.items;
          this.voidedReceiptsPage = response.page;
          this.voidedReceiptsTotalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.voidedReceiptsError = normalizedError.userMessage;
          this.voidedReceiptItems = [];
        }
      });
  }

  private loadAuditLogs(page: number): void {
    this.auditError = null;
    this.isAuditLoading = true;

    this.reportsApi
      .getAuditLogs({
        fromUtc: this.toUtcString(this.auditFilterForm.controls.fromUtc.value),
        toUtc: this.toUtcString(this.auditFilterForm.controls.toUtc.value),
        userName: this.cleanString(this.auditFilterForm.controls.userName.value),
        entityName: this.cleanString(this.auditFilterForm.controls.entityName.value),
        action: this.cleanString(this.auditFilterForm.controls.action.value),
        page,
        pageSize: this.auditFilterForm.controls.pageSize.value
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isAuditLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.auditItems = response.items;
          this.auditPage = response.page;
          this.auditTotalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.auditError = normalizedError.userMessage;
          this.auditItems = [];
        }
      });
  }

  private totalPages(totalCount: number, pageSize: number): number {
    const totalPages = Math.ceil(totalCount / pageSize);
    return Math.max(1, totalPages);
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  private toUtcString(value: string | null | undefined): string | null {
    const normalized = this.cleanString(value);
    if (!normalized) {
      return null;
    }

    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.toISOString();
  }

  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private startOfMonthString(): string {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), 1);
    return date.toISOString().slice(0, 10);
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
