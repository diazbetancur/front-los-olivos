import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthSessionService } from '../auth/auth-session.service';
import { AppFeedbackService } from '../ui/app-feedback.service';

const RefreshAttemptHeader = 'x-refresh-attempt';
const AuthPaths = {
  login: '/api/v1/auth/login',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout'
} as const;

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const authSession = inject(AuthSessionService);
  const router = inject(Router);
  const feedback = inject(AppFeedbackService);

  const hasAccessToken = !!authSession.getAccessToken();
  const isLoginRequest = request.url.includes(AuthPaths.login);
  const isRefreshRequest = request.url.includes(AuthPaths.refresh);
  const isLogoutRequest = request.url.includes(AuthPaths.logout);
  const isRetriedRequest = request.headers.get(RefreshAttemptHeader) === '1';

  const requestWithToken = hasAccessToken && !isLoginRequest && !isRefreshRequest
    ? request.clone({
        setHeaders: {
          Authorization: `Bearer ${authSession.getAccessToken()!}`
        }
      })
    : request;

  return next(requestWithToken).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      if (error.status === 403) {
        feedback.showError('No tienes permisos para acceder a este recurso.');
        return throwError(() => error);
      }

      if (error.status !== 401) {
        return throwError(() => error);
      }

      if (isLoginRequest || isRefreshRequest || isLogoutRequest || isRetriedRequest) {
        authSession.clearSession();
        feedback.showError('Tu sesion no es valida. Inicia sesion nuevamente.');
        void router.navigate(['/login']);
        return throwError(() => error);
      }

      return authSession.refreshAccessToken().pipe(
        switchMap((refreshedSession) => {
          const retriedRequest = request.clone({
            setHeaders: {
              Authorization: `Bearer ${refreshedSession.accessToken}`,
              [RefreshAttemptHeader]: '1'
            }
          });

          return next(retriedRequest);
        }),
        catchError((refreshError) => {
          authSession.clearSession();
          feedback.showError('Tu sesion expiro. Inicia sesion nuevamente.');
          void router.navigate(['/login']);
          return throwError(() => refreshError);
        })
      );
    })
  );
};

