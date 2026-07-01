import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { permissionGuard } from './core/guards/permission.guard';
import { adminAreaGuard } from './core/guards/admin-area.guard';
import { clientAreaGuard } from './core/guards/client-area.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login'
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.component').then((m) => m.LoginComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-shell/admin-shell.component').then((m) => m.AdminShellComponent),
    canActivate: [authGuard, adminAreaGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/admin/dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
        data: {
          title: 'Dashboard',
          description: 'Vista general del panel administrativo.'
        }
      },
      {
        path: 'inventory',
        loadComponent: () => import('./features/inventory/pages/inventory-home.component').then((m) => m.InventoryHomeComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Inventario',
          description: 'Gestion base de inventario de proyectos, bloques y lotes.',
          requiredPermissions: ['Projects.View', 'Lots.View']
        }
      },
      {
        path: 'projects',
        loadComponent: () => import('./features/inventory/pages/projects-page.component').then((m) => m.ProjectsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Proyectos',
          description: 'Administracion de proyectos inmobiliarios.',
          requiredPermissions: ['Projects.View']
        }
      },
      {
        path: 'lots',
        loadComponent: () => import('./features/inventory/pages/lots-page.component').then((m) => m.LotsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Lotes',
          description: 'Catalogo y estado operativo de lotes.',
          requiredPermissions: ['Lots.View']
        }
      },
      {
        path: 'clients',
        loadComponent: () => import('./features/clients/pages/clients-page.component').then((m) => m.ClientsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Clientes',
          description: 'Gestion de clientes, beneficiarios y referencias.',
          requiredPermissions: ['Clients.View']
        }
      },
      {
        path: 'clients/new',
        loadComponent: () =>
          import('./features/clients/pages/client-form-page/client-form-page.component').then(
            (m) => m.ClientFormPageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          title: 'Nuevo cliente',
          description: 'Registro de un nuevo cliente.',
          requiredPermissions: ['Clients.Create']
        }
      },
      {
        path: 'clients/:id',
        loadComponent: () =>
          import('./features/clients/pages/client-form-page/client-form-page.component').then(
            (m) => m.ClientFormPageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          title: 'Detalle de cliente',
          description: 'Datos del cliente, beneficiarios y referencias.',
          requiredPermissions: ['Clients.View']
        }
      },
      {
        path: 'contracts',
        loadComponent: () => import('./features/contracts/pages/contracts-page.component').then((m) => m.ContractsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Contratos',
          description: 'Modulo de contratos administrativos y snapshots.',
          requiredPermissions: ['Contracts.View']
        }
      },
      {
        path: 'contracts/new',
        loadComponent: () =>
          import('./features/contracts/pages/contract-form-page/contract-form-page.component').then(
            (m) => m.ContractFormPageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          title: 'Nuevo contrato',
          description: 'Registro de un nuevo contrato.',
          requiredPermissions: ['Contracts.Create']
        }
      },
      {
        path: 'contracts/:id',
        loadComponent: () =>
          import('./features/contracts/pages/contract-form-page/contract-form-page.component').then(
            (m) => m.ContractFormPageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          title: 'Detalle de contrato',
          description: 'Detalle del contrato, cronograma y documentos.',
          requiredPermissions: ['Contracts.View']
        }
      },
      {
        path: 'payments',
        loadComponent: () => import('./features/payments/pages/payments-page.component').then((m) => m.PaymentsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Pagos',
          description: 'Registro y aplicacion de pagos contractuales.',
          requiredPermissions: ['Payments.View']
        }
      },
      {
        path: 'payments/:id',
        loadComponent: () =>
          import('./features/payments/pages/payment-detail-page/payment-detail-page.component').then(
            (m) => m.PaymentDetailPageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          title: 'Detalle de pago',
          description: 'Detalle de pago, aplicaciones y balance del contrato.',
          requiredPermissions: ['Payments.View']
        }
      },
      {
        path: 'receipts',
        loadComponent: () => import('./features/payments/pages/receipts-page.component').then((m) => m.ReceiptsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Recibos',
          description: 'Consulta y administracion de recibos emitidos.',
          requiredPermissions: ['Receipts.View']
        }
      },
      {
        path: 'receipts/:id',
        loadComponent: () =>
          import('./features/payments/pages/receipt-detail-page/receipt-detail-page.component').then(
            (m) => m.ReceiptDetailPageComponent
          ),
        canActivate: [permissionGuard],
        data: {
          title: 'Detalle de recibo',
          description: 'Detalle, descarga y anulación de un recibo.',
          requiredPermissions: ['Receipts.View']
        }
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/pages/reports-page.component').then((m) => m.ReportsPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Reportes',
          description: 'Reportes administrativos y consulta de auditoria.',
          requiredPermissions: ['Reports.View', 'Audit.View']
        }
      },
      {
        path: 'users',
        loadComponent: () => import('./features/security/pages/users-page.component').then((m) => m.UsersPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Usuarios',
          description: 'Administracion de usuarios del sistema.',
          requiredPermissions: ['Users.View']
        }
      },
      {
        path: 'roles',
        loadComponent: () => import('./features/security/pages/roles-page.component').then((m) => m.RolesPageComponent),
        canActivate: [permissionGuard],
        data: {
          title: 'Roles',
          description: 'Configuracion de roles y permisos.',
          requiredPermissions: ['Roles.View']
        }
      }
    ]
  },
  {
    path: 'client/login',
    loadComponent: () =>
      import('./features/client-portal/pages/client-login/client-login.component').then((m) => m.ClientLoginComponent)
  },
  {
    path: 'client/register',
    loadComponent: () =>
      import('./features/client-portal/pages/client-register/client-register.component').then(
        (m) => m.ClientRegisterComponent
      )
  },
  {
    path: 'client',
    loadComponent: () =>
      import('./features/client-portal/client-shell/client-shell.component').then((m) => m.ClientShellComponent),
    canActivate: [clientAreaGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'contracts'
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/client-portal/pages/client-profile/client-profile.component').then(
            (m) => m.ClientProfileComponent
          ),
        data: {
          title: 'Mi perfil',
          description: 'Datos personales y cambio de contraseña.'
        }
      },
      {
        path: 'contracts',
        loadComponent: () =>
          import('./features/client-portal/pages/client-contracts-page.component').then((m) => m.ClientContractsPageComponent),
        data: {
          title: 'Mis contratos',
          description: 'Consulta de contratos propios del cliente.'
        }
      },
      {
        path: 'contracts/:id',
        loadComponent: () =>
          import('./features/client-portal/pages/client-contract-detail-page.component').then(
            (m) => m.ClientContractDetailPageComponent
          ),
        data: {
          section: 'overview'
        }
      },
      {
        path: 'contracts/:id/schedule',
        loadComponent: () =>
          import('./features/client-portal/pages/client-contract-detail-page.component').then(
            (m) => m.ClientContractDetailPageComponent
          ),
        data: {
          section: 'schedule'
        }
      },
      {
        path: 'contracts/:id/payments',
        loadComponent: () =>
          import('./features/client-portal/pages/client-contract-detail-page.component').then(
            (m) => m.ClientContractDetailPageComponent
          ),
        data: {
          section: 'payments'
        }
      },
      {
        path: 'contracts/:id/receipts',
        loadComponent: () =>
          import('./features/client-portal/pages/client-contract-detail-page.component').then(
            (m) => m.ClientContractDetailPageComponent
          ),
        data: {
          section: 'receipts'
        }
      }
    ]
  },
  {
    path: '**',
    redirectTo: 'admin/dashboard'
  }
];
