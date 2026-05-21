import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GlobalLoadingService {
  private readonly pendingRequests = signal(0);
  readonly isBusy = computed(() => this.pendingRequests() > 0);

  begin(): void {
    this.pendingRequests.update((value) => value + 1);
  }

  end(): void {
    this.pendingRequests.update((value) => Math.max(0, value - 1));
  }
}
