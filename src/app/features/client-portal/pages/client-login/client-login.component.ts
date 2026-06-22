import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { AuthSessionService } from '../../../../core/auth/auth-session.service';
import { ClientAuthApiService } from '../../services/client-auth-api.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { PwaInstallPromptComponent } from '../../../../shared/components/pwa-install-prompt/pwa-install-prompt';

@Component({
  selector: 'app-client-login',
  templateUrl: './client-login.component.html',
  styleUrl: './client-login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, PwaInstallPromptComponent]
})
export class ClientLoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clientAuthApi = inject(ClientAuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly feedback = inject(AppFeedbackService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    documentNumber: ['', [Validators.required, Validators.maxLength(50)]],
    password: ['', [Validators.required, Validators.maxLength(256)]]
  });

  submit(): void {
    console.log('[DEBUG-login] submit() called. form.valid=', this.form.valid, 'loading=', this.loading());
    if (this.form.invalid || this.loading()) {
      console.log('[DEBUG-login] early return. documentNumber.errors=', this.form.controls.documentNumber.errors, 'password.errors=', this.form.controls.password.errors);
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.serverError.set(null);

    const { documentNumber, password } = this.form.getRawValue();

    console.log('[DEBUG-login] calling clientAuthApi.login for documentNumber=', documentNumber);
    this.clientAuthApi
      .login({ documentNumber, password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          console.log('[DEBUG-login] login API SUCCESS. roles=', (response as unknown as { user?: { roles?: unknown } })?.user?.roles);
          this.authSession
            .loginWithResponse(response)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.loading.set(false);
                const home = this.authSession.resolveHomeRoute();
                console.log('[DEBUG-login] loginWithResponse OK. resolveHomeRoute=', home, '→ navigating');
                void this.router.navigate([home]);
              },
              error: (e) => {
                console.error('[DEBUG-login] loginWithResponse ERROR', e);
                this.loading.set(false);
                this.serverError.set('Error al cargar la sesión. Inténtalo de nuevo.');
              }
            });
        },
        error: (err: unknown) => {
          console.error('[DEBUG-login] login API ERROR', err);
          this.loading.set(false);
          const detail = (err as { error?: { detail?: string } })?.error?.detail;
          this.serverError.set(detail ?? 'Número de documento o contraseña incorrectos.');
        }
      });
  }
}
