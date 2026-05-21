import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { ClientContractListItem } from '../models/client-portal.models';
import { ClientPortalApiService } from '../services/client-portal-api.service';

@Component({
  selector: 'app-client-contracts-page',
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingStateComponent, EmptyStateComponent],
  templateUrl: './client-contracts-page.component.html',
  styleUrl: './client-contracts-page.component.scss'
})
export class ClientContractsPageComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly clientPortalApi = inject(ClientPortalApiService);
  private readonly apiErrorService = inject(ApiErrorService);

  readonly filterForm = this.formBuilder.nonNullable.group({
    status: [''],
    search: ['', [Validators.maxLength(128)]],
    fromDate: [''],
    toDate: [''],
    pageSize: [20, [Validators.min(1), Validators.max(100)]]
  });

  readonly statuses: ReadonlyArray<string> = [
    'Borrador',
    'PendienteFirma',
    'Activo',
    'EnMora',
    'Pagado',
    'Cerrado',
    'Rescindido',
    'Anulado'
  ];

  contracts: ReadonlyArray<ClientContractListItem> = [];
  isLoading = false;
  errorMessage: string | null = null;
  currentPage = 1;
  totalCount = 0;

  ngOnInit(): void {
    this.loadContracts(1);
  }

  applyFilters(): void {
    this.loadContracts(1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      status: '',
      search: '',
      fromDate: '',
      toDate: '',
      pageSize: 20
    });
    this.loadContracts(1);
  }

  previousPage(): void {
    if (this.currentPage <= 1) {
      return;
    }
    this.loadContracts(this.currentPage - 1);
  }

  nextPage(): void {
    if (this.currentPage >= this.totalPages()) {
      return;
    }
    this.loadContracts(this.currentPage + 1);
  }

  totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.filterForm.controls.pageSize.value));
  }

  statusClass(status: string): string {
    switch (status) {
      case 'Activo':
      case 'Pagado':
      case 'Cerrado':
        return 'status-badge ok';
      case 'EnMora':
      case 'Rescindido':
      case 'Anulado':
        return 'status-badge danger';
      case 'PendienteFirma':
      case 'Borrador':
        return 'status-badge warn';
      default:
        return 'status-badge';
    }
  }

  private loadContracts(page: number): void {
    this.isLoading = true;
    this.errorMessage = null;

    const raw = this.filterForm.getRawValue();
    this.clientPortalApi
      .getContracts({
        status: this.cleanString(raw.status),
        search: this.cleanString(raw.search),
        fromDate: this.cleanString(raw.fromDate),
        toDate: this.cleanString(raw.toDate),
        page,
        pageSize: raw.pageSize
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.isLoading = false;
          this.syncView();
        })
      )
      .subscribe({
        next: (response) => {
          this.contracts = response.items;
          this.currentPage = response.page;
          this.totalCount = response.totalCount;
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.errorMessage = normalizedError.userMessage;
          this.contracts = [];
        }
      });
  }

  private cleanString(value: string | null | undefined): string | null {
    if (!value) {
      return null;
    }
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private syncView(): void {
    if ((this.changeDetectorRef as ViewRef).destroyed) {
      return;
    }
    this.changeDetectorRef.detectChanges();
  }
}
