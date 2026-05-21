import { Injectable } from '@angular/core';
import { AuthSessionState } from './models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthStorageService {
  private static readonly SessionKey = 'constructora.admin.session';

  save(session: AuthSessionState): void {
    if (!this.hasStorage()) {
      return;
    }

    globalThis.sessionStorage.setItem(AuthStorageService.SessionKey, JSON.stringify(session));
  }

  load(): AuthSessionState | null {
    if (!this.hasStorage()) {
      return null;
    }

    const rawValue = globalThis.sessionStorage.getItem(AuthStorageService.SessionKey);
    if (!rawValue) {
      return null;
    }

    try {
      return JSON.parse(rawValue) as AuthSessionState;
    } catch {
      this.clear();
      return null;
    }
  }

  clear(): void {
    if (!this.hasStorage()) {
      return;
    }

    globalThis.sessionStorage.removeItem(AuthStorageService.SessionKey);
  }

  private hasStorage(): boolean {
    return typeof globalThis !== 'undefined' && !!globalThis.sessionStorage;
  }
}

