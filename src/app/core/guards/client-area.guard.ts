import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../auth/auth-session.service';
import { AppFeedbackService } from '../ui/app-feedback.service';

const passwordChangeRoute = '/client/cambiar-password';

export const clientAreaGuard: CanActivateFn = (_route, state) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const feedback = inject(AppFeedbackService);

  if (!authSession.hasRole('Cliente')) {
    feedback.showError('Inicia sesión en el portal cliente para continuar.');
    return router.createUrlTree(['/client/login']);
  }

  if (authSession.mustChangePassword() && !state.url.startsWith(passwordChangeRoute)) {
    return router.createUrlTree([passwordChangeRoute]);
  }

  return true;
};
