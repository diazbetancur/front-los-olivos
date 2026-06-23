import { Pipe, PipeTransform } from '@angular/core';

/**
 * Convierte el código de estado (valor de contrato) en una etiqueta legible.
 * Los códigos multi-palabra se mapean explícitamente; el resto se muestra tal cual.
 */
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  private static readonly labels: Readonly<Record<string, string>> = {
    PendienteRevision: 'Pendiente revisión'
  };

  transform(status: string | null | undefined): string {
    if (!status) {
      return '—';
    }
    return StatusLabelPipe.labels[status] ?? status;
  }
}
