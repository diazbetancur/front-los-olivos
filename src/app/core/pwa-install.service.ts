import { Injectable, signal } from '@angular/core';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const SESSION_KEY = 'pwa_install_dismissed';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  readonly isIos = signal(false);
  readonly isStandalone = signal(false);
  readonly canPrompt = signal(false);
  readonly isDismissed = signal(false);

  constructor() {
    this.isIos.set(/iphone|ipad|ipod/i.test(navigator.userAgent));
    this.isStandalone.set(
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
    this.isDismissed.set(sessionStorage.getItem(SESSION_KEY) === '1');

    if (!this.isStandalone()) {
      window.addEventListener('beforeinstallprompt', (e: Event) => {
        e.preventDefault();
        this.deferredPrompt = e as BeforeInstallPromptEvent;
        this.canPrompt.set(true);
      });

      window.addEventListener('appinstalled', () => {
        this.deferredPrompt = null;
        this.canPrompt.set(false);
      });
    }
  }

  dismiss(): void {
    sessionStorage.setItem(SESSION_KEY, '1');
    this.isDismissed.set(true);
    this.canPrompt.set(false);
  }

  async install(): Promise<void> {
    if (!this.deferredPrompt) return;
    await this.deferredPrompt.prompt();
    const choice = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    if (choice.outcome === 'accepted') {
      this.canPrompt.set(false);
    }
  }
}
