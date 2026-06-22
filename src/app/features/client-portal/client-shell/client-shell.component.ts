import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';
import { PwaInstallPromptComponent } from '../../../shared/components/pwa-install-prompt/pwa-install-prompt';

@Component({
  selector: 'app-client-shell',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, PwaInstallPromptComponent],
  templateUrl: './client-shell.component.html',
  styleUrl: './client-shell.component.scss'
})
export class ClientShellComponent {
  private readonly authSession = inject(AuthSessionService);
  private readonly feedback = inject(AppFeedbackService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly currentUser = this.authSession.currentUser;
  readonly displayName = computed(() => {
    const user = this.currentUser();
    if (!user) {
      return '';
    }

    const fullName = `${user.firstName} ${user.lastName}`.trim();
    return fullName.length > 0 ? fullName : user.userName;
  });

  logout(): void {
    this.authSession
      .logout()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.feedback.clear();
          void this.router.navigate(['/client/login']);
        }
      });
  }
}
