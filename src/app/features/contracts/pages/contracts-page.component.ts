import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import {
  ClientLookupItem,
  ContractListItemResponse,
  ContractStatus,
  GetProjectContractsQuery,
  LotLookupItem,
  PagedResult,
  ProjectLookupItem
} from '../models/contracts.models';
import { ContractsApiService } from '../services/contracts-api.service';

const LOOKUP_PAGE_SIZE = 100;

@Component({
  selector: 'app-contracts-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
  private readonly router = inject(Router);
  private readonly contractsApi = inject(ContractsApiService);
  private readonly apiErrorService = inject(ApiErrorService);

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

  contracts: ReadonlyArray<ContractListItemResponse> = [];
  projectOptions: ReadonlyArray<ProjectLookupItem> = [];
  lotOptions: ReadonlyArray<LotLookupItem> = [];
  clientOptions: ReadonlyArray<ClientLookupItem> = [];

  // Combobox state — list project filter (typeahead)
  listProjectSearch = '';
  listProjectDropdownItems: ReadonlyArray<ProjectLookupItem> = [];
  showListProjectDropdown = false;

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  listError: string | null = null;

  readonly totalPages = computed(() => {
    const pageSize = this.filterForm.controls.pageSize.value;
    return Math.max(1, Math.ceil(this.totalCount / pageSize));
  });

  // Refleja la ultima consulta aplicada (no el estado del formulario): controla si se muestra
  // el estado vacio inicial o la tabla/paginacion.
  hasQueried = false;

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
    // Sin proyecto, loadContracts restablece el estado vacio inicial (limpia una busqueda global).
    this.loadContracts(1);
  }

  onPageSizeChange(size: number): void {
    this.filterForm.controls.pageSize.setValue(size);
    this.loadContracts(1);
  }

  openCreateContract(): void {
    void this.router.navigate(['/admin/contracts/new']);
  }

  openContract(contractId: string): void {
    void this.router.navigate(['/admin/contracts', contractId]);
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

  resolveProjectLabel(projectId: string): string {
    return this.projectOptions.find((item) => item.id === projectId)?.name ?? projectId;
  }

  resolveLotLabel(lotId: string): string {
    return this.lotOptions.find((item) => item.id === lotId)?.fullCode ?? lotId;
  }

  lotSummary(contract: ContractListItemResponse): string {
    // Preferir el código resuelto server-side (incluye todos los lotes); así no se muestra el
    // UUID cuando el lote no está en la página de opciones cargada en el cliente (OBS-011).
    if (contract.lotsCode && contract.lotsCode.trim().length > 0) {
      return contract.lotsCode;
    }
    const code = this.resolveLotLabel(contract.lotId);
    return contract.lotCount > 1 ? `${code} (+${contract.lotCount - 1})` : code;
  }

  resolveClientLabel(clientId: string): string {
    return this.clientOptions.find((item) => item.id === clientId)?.fullName ?? clientId;
  }

  protected loadContracts(page: number): void {
    const projectId = this.cleanString(this.filterForm.controls.projectId.value);
    const search = this.cleanString(this.filterForm.controls.search.value);
    if (!projectId && !search) {
      // Sin proyecto ni busqueda no se consulta el backend; se muestra el estado vacio.
      // Con termino de busqueda se permite buscar globalmente por numero (OBS-014).
      this.contracts = [];
      this.totalCount = 0;
      this.currentPage = 1;
      this.listError = null;
      this.isLoading = false;
      this.hasQueried = false;
      return;
    }

    this.listError = null;
    this.isLoading = true;
    this.hasQueried = true;

    const query: GetProjectContractsQuery = {
      projectId,
      page,
      pageSize: this.filterForm.controls.pageSize.value,
      status: this.cleanString(this.filterForm.controls.status.value),
      search,
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

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
