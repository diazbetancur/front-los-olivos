import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { NormalizedApiError, ProblemDetails } from './problem-details.model';

@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  normalize(error: unknown): NormalizedApiError {
    if (!(error instanceof HttpErrorResponse)) {
      return {
        status: 0,
        title: 'Error inesperado',
        detail: 'Ocurrio un error inesperado.',
        fieldErrors: [],
        userMessage: 'No se pudo completar la solicitud.'
      };
    }

    const payload = this.readProblemDetails(error);
    const fieldErrors = this.flattenErrors(payload?.errors);
    const detail = payload?.detail?.trim() || error.message || 'Ocurrio un error en la solicitud.';
    const title = payload?.title?.trim() || this.titleByStatus(error.status);

    return {
      status: error.status,
      title,
      detail,
      fieldErrors,
      userMessage: this.userMessageByStatus(error.status, detail)
    };
  }

  private readProblemDetails(error: HttpErrorResponse): ProblemDetails | null {
    if (!error.error) {
      return null;
    }

    if (typeof error.error === 'string') {
      try {
        return JSON.parse(error.error) as ProblemDetails;
      } catch {
        return null;
      }
    }

    return error.error as ProblemDetails;
  }

  private flattenErrors(errors?: Record<string, string[]>): string[] {
    if (!errors) {
      return [];
    }

    return Object.values(errors)
      .flat()
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  private titleByStatus(status: number): string {
    switch (status) {
      case 400:
        return 'Error de validacion';
      case 401:
        return 'Sesion no valida';
      case 403:
        return 'Acceso denegado';
      case 404:
        return 'Recurso no encontrado';
      case 409:
        return 'Conflicto de negocio';
      default:
        return 'Error';
    }
  }

  private userMessageByStatus(status: number, detail: string): string {
    switch (status) {
      case 0:
        return 'No fue posible conectar con el servidor. Verifica red y backend.';
      case 400:
        return detail;
      case 401:
        return 'Tu sesion expiro o no es valida. Inicia sesion nuevamente.';
      case 403:
        return 'No tienes permisos para realizar esta accion.';
      case 404:
        return 'No se encontro el recurso solicitado.';
      case 409:
        return detail;
      default:
        return 'No fue posible completar la operacion.';
    }
  }
}

