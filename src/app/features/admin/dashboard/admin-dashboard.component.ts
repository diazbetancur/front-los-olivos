import { CommonModule } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthSessionService } from '../../../core/auth/auth-session.service';

interface DashboardCard {
  title: string;
  description: string;
  route: string;
  requiredPermissions?: ReadonlyArray<string>;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss'
})
export class AdminDashboardComponent {
  private readonly authSession = inject(AuthSessionService);

  readonly cards: ReadonlyArray<DashboardCard> = [
    {
      title: 'Inventario',
      description: 'Gestiona proyectos, bloques y lotes del residencial.',
      route: '/admin/inventory',
      requiredPermissions: ['Projects.View', 'Lots.View']
    },
    {
      title: 'Clientes',
      description: 'Administra clientes, beneficiarios y referencias.',
      route: '/admin/clients',
      requiredPermissions: ['Clients.View']
    },
    {
      title: 'Contratos',
      description: 'Consulta y opera contratos, cronograma y documentos.',
      route: '/admin/contracts',
      requiredPermissions: ['Contracts.View']
    },
    {
      title: 'Pagos',
      description: 'Registra pagos, aplica cuotas y revisa balances.',
      route: '/admin/payments',
      requiredPermissions: ['Payments.View']
    },
    {
      title: 'Recibos',
      description: 'Gestiona recibos emitidos y descargas PDF/DOCX.',
      route: '/admin/receipts',
      requiredPermissions: ['Receipts.View']
    },
    {
      title: 'Reportes',
      description: 'Resumenes operativos, saldos y auditoria administrativa.',
      route: '/admin/reports',
      requiredPermissions: ['Reports.View', 'Audit.View']
    }
  ];

  readonly visibleCards = computed(() =>
    this.cards.filter((card) => {
      if (!card.requiredPermissions || card.requiredPermissions.length === 0) {
        return true;
      }

      return this.authSession.hasAnyPermission(card.requiredPermissions);
    })
  );
}
