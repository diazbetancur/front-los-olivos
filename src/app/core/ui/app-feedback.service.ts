import { Injectable, computed, signal } from '@angular/core';

export type FeedbackLevel = 'info' | 'success' | 'warning' | 'error';

export interface FeedbackMessage {
  id?: string;
  level: FeedbackLevel;
  text: string;
  durationMs?: number;
}

@Injectable({ providedIn: 'root' })
export class AppFeedbackService {
  private readonly queue = signal<ReadonlyArray<Required<FeedbackMessage>>>([]);
  readonly messages = computed(() => this.queue());
  readonly message = computed(() => this.queue()[0] ?? null);

  show(message: FeedbackMessage): void {
    const toast: Required<FeedbackMessage> = {
      id: message.id ?? crypto.randomUUID(),
      level: message.level,
      text: message.text,
      durationMs: message.durationMs ?? this.defaultDuration(message.level)
    };

    this.queue.update((items) => [...items, toast]);

    if (toast.durationMs > 0) {
      globalThis.setTimeout(() => {
        this.clear(toast.id);
      }, toast.durationMs);
    }
  }

  showError(text: string): void {
    this.show({ level: 'error', text, durationMs: 6500 });
  }

  showSuccess(text: string): void {
    this.show({ level: 'success', text, durationMs: 3200 });
  }

  showInfo(text: string): void {
    this.show({ level: 'info', text, durationMs: 3200 });
  }

  showWarning(text: string): void {
    this.show({ level: 'warning', text, durationMs: 4500 });
  }

  clear(id?: string): void {
    if (!id) {
      this.queue.set([]);
      return;
    }

    this.queue.update((items) => items.filter((item) => item.id !== id));
  }

  private defaultDuration(level: FeedbackLevel): number {
    switch (level) {
      case 'error':
        return 6500;
      case 'warning':
        return 4500;
      default:
        return 3200;
    }
  }
}
