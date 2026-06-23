import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';

interface AdminNavItem {
  label: string;
  route?: string;
  requiredPermissions?: ReadonlyArray<string>;
  children?: ReadonlyArray<AdminNavItem>;
  isEnabled?: boolean;
}

@Component({
  selector: 'app-admin-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss'
})
export class AdminShellComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUser = this.authSession.currentUser;
  readonly roles = this.authSession.roles;
  readonly permissions = this.authSession.permissions;

  readonly navItems: ReadonlyArray<AdminNavItem> = [
    { label: 'Inicio', route: '/admin/dashboard' },
    {
      label: 'Inventario',
      children: [
        { label: 'Proyectos', route: '/admin/projects', requiredPermissions: ['Projects.View'] },
        { label: 'Lotes', route: '/admin/lots', requiredPermissions: ['Lots.View'] }
      ]
    },
    { label: 'Clientes', route: '/admin/clients', requiredPermissions: ['Clients.View'] },
    { label: 'Comercial', route: '/admin/contracts', requiredPermissions: ['Contracts.View'] },
    {
      label: 'Finanzas',
      children: [
        { label: 'Pagos', route: '/admin/payments', requiredPermissions: ['Payments.View'] },
        { label: 'Recibos', route: '/admin/receipts', requiredPermissions: ['Receipts.View'] }
      ]
    },
    { label: 'Reportes', route: '/admin/reports', requiredPermissions: ['Reports.View', 'Audit.View'] },
    {
      label: 'Seguridad',
      children: [
        { label: 'Usuarios', route: '/admin/users', requiredPermissions: ['Users.View'] },
        { label: 'Roles', route: '/admin/roles', requiredPermissions: ['Roles.View'] }
      ]
    }
  ];

  private readonly expandedGroups = signal<Record<string, boolean>>({});

  readonly visibleNavItems = computed(() => this.navItems.filter((item) => this.canSeeItem(item)));

  constructor() {
    this.authSession
      .refreshCurrentUser()
      .pipe(
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  toggleGroup(label: string): void {
    this.expandedGroups.update((value) => ({
      ...value,
      [label]: !this.isExpanded(label)
    }));
  }

  isExpanded(label: string): boolean {
    const state = this.expandedGroups();
    if (state[label] === undefined) {
      return false;
    }
    return state[label];
  }

  isGroupActive(item: AdminNavItem): boolean {
    if (!item.children || item.children.length === 0) {
      return false;
    }
    const currentUrl = this.router.url;
    return item.children.some((child) => child.route && currentUrl.startsWith(child.route));
  }

  canSeeItem(item: AdminNavItem): boolean {
    if (item.isEnabled === false) {
      return false;
    }

    if (item.children && item.children.length > 0) {
      return item.children.some((child) => this.canSeeItem(child));
    }

    if (!item.requiredPermissions || item.requiredPermissions.length === 0) {
      return true;
    }

    return this.authSession.hasAnyPermission(item.requiredPermissions);
  }

  logout(): void {
    this.authSession
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.feedback.clear();
          void this.router.navigate(['/login']);
        }
      });
  }
}
