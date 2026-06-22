import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PwaInstallService } from '../../../core/pwa-install.service';

@Component({
  selector: 'app-pwa-install-prompt',
  templateUrl: './pwa-install-prompt.html',
  styleUrl: './pwa-install-prompt.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaInstallPromptComponent {
  protected readonly pwa = inject(PwaInstallService);

  protected readonly shouldShow = computed(
    () =>
      !this.pwa.isStandalone() &&
      !this.pwa.isDismissed() &&
      (this.pwa.isIos() || this.pwa.canPrompt()),
  );

  protected dismiss(): void {
    this.pwa.dismiss();
  }

  protected install(): void {
    void this.pwa.install();
  }
}
