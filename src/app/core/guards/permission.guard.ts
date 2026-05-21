import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../auth/auth-session.service';
import { AppFeedbackService } from '../ui/app-feedback.service';

export const permissionGuard: CanActivateFn = (route) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const feedback = inject(AppFeedbackService);

  const requiredPermissions =
    (route.data['requiredPermissions'] as ReadonlyArray<string> | undefined) ??
    (route.data['permissions'] as ReadonlyArray<string> | undefined) ??
    [];

  if (authSession.hasAnyPermission(requiredPermissions)) {
    return true;
  }

  feedback.showError('No tienes permisos para acceder a esta seccion.');
  return router.createUrlTree(['/admin/dashboard']);
};
