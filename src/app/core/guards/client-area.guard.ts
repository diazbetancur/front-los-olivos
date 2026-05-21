import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../auth/auth-session.service';
import { AppFeedbackService } from '../ui/app-feedback.service';

export const clientAreaGuard: CanActivateFn = () => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const feedback = inject(AppFeedbackService);

  if (authSession.hasRole('Cliente')) {
    return true;
  }

  feedback.showError('No tienes acceso al portal cliente.');
  return router.createUrlTree(['/admin/dashboard']);
};
