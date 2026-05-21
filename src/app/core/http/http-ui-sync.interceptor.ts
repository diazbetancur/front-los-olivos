import { HttpInterceptorFn } from '@angular/common/http';
import { ApplicationRef, inject } from '@angular/core';
import { finalize } from 'rxjs';

export const httpUiSyncInterceptor: HttpInterceptorFn = (request, next) => {
  const appRef = inject(ApplicationRef);

  return next(request).pipe(
    finalize(() => {
      queueMicrotask(() => {
        appRef.tick();
      });
    })
  );
};
