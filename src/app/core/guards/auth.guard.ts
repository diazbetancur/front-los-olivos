import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthSessionService } from '../auth/auth-session.service';
import { AppFeedbackService } from '../ui/app-feedback.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const feedback = inject(AppFeedbackService);

  if (authSession.isAuthenticated()) {
    return true;
  }

  feedback.showError('Debes iniciar sesion para continuar.');
  return router.createUrlTree(['/login'], {
    queryParams: {
      returnUrl: state.url
    }
  });
};

