import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { GlobalLoadingService } from '../ui/global-loading.service';

const BackgroundMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export const globalLoadingInterceptor: HttpInterceptorFn = (request, next) => {
  if (BackgroundMethods.has(request.method.toUpperCase())) {
    return next(request);
  }

  const loading = inject(GlobalLoadingService);
  loading.begin();

  return next(request).pipe(
    finalize(() => {
      loading.end();
    })
  );
};
