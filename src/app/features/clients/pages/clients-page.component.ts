import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewRef, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { LoadingStateComponent } from '../../../shared/components/loading-state/loading-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ClientListItemResponse, GetClientsQuery, PagedResult } from '../models/clients.models';
import { ClientsApiService } from '../services/clients-api.service';

@Component({
  selector: 'app-clients-page',
  imports: [
    CommonModule,
    ReactiveFormsModule,
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
  private readonly router = inject(Router);
  private readonly clientsApi = inject(ClientsApiService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly authSession = inject(AuthSessionService);

  readonly canDisable = computed(() => this.authSession.hasPermission('Clients.Disable'));

  readonly filterForm = this.formBuilder.nonNullable.group({
    search: ['', [Validators.maxLength(256)]],
    dni: ['', [Validators.maxLength(32)]],
    rtn: ['', [Validators.maxLength(32)]],
    pageSize: [20, [Validators.min(1), Validators.max(100)]]
  });

  clients: ReadonlyArray<ClientListItemResponse> = [];

  currentPage = 1;
  totalCount = 0;

  isLoading = false;
  isSubmitting = false;

  listError: string | null = null;

  ngOnInit(): void {
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

  openCreateClient(): void {
    void this.router.navigate(['/admin/clients/new']);
  }

  openClient(clientId: string): void {
    void this.router.navigate(['/admin/clients', clientId]);
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
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          this.feedback.showError(normalizedError.userMessage);
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
