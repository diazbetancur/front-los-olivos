import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../auth/auth-session.service';
import { AppFeedbackService } from '../ui/app-feedback.service';

const ADMIN_ROLE_NAMES = new Set(['superadmin', 'admin', 'ventas', 'caja', 'auditor']);

export const adminAreaGuard: CanActivateFn = () => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const feedback = inject(AppFeedbackService);

  const hasAdminRole = authSession
    .roles()
    .some((role) => ADMIN_ROLE_NAMES.has(role.name.trim().toLowerCase()));

  if (hasAdminRole) {
    return true;
  }

  if (authSession.hasRole('Cliente')) {
    feedback.showError('No tienes acceso al panel administrativo.');
    return router.createUrlTree(['/client/contracts']);
  }

  feedback.showError('No tienes permisos para acceder a esta seccion.');
  return router.createUrlTree(['/login']);
};
