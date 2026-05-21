import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export const apiBaseUrlInterceptor: HttpInterceptorFn = (request, next) => {
  if (/^https?:\/\//i.test(request.url)) {
    if (environment.production && /^http:\/\//i.test(request.url)) {
      return throwError(
        () =>
          new HttpErrorResponse({
            error: 'Plain HTTP requests are not allowed in production.',
            status: 0,
            url: request.url
          })
      );
    }
    return next(request);
  }

  const normalizedPath = request.url.startsWith('/') ? request.url : `/${request.url}`;
  const normalizedBaseUrl = environment.apiBaseUrl.replace(/\/+$/, '');

  if (environment.production && !/^https:\/\//i.test(normalizedBaseUrl)) {
    return throwError(
      () =>
        new HttpErrorResponse({
          error: 'environment.apiBaseUrl must use HTTPS in production.',
          status: 0,
          url: normalizedBaseUrl
        })
    );
  }

  const updatedRequest = request.clone({
    url: `${normalizedBaseUrl}${normalizedPath}`
  });

  return next(updatedRequest);
};
