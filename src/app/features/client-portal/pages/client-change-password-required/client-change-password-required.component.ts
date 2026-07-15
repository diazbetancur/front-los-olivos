import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSessionService } from '../../../../core/auth/auth-session.service';
import { ClientAuthApiService } from '../../services/client-auth-api.service';
import { PasswordRulesComponent } from '../../../security/components/password-rules/password-rules';
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPw = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return newPw === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-client-change-password-required',
  templateUrl: './client-change-password-required.component.html',
  styleUrl: './client-change-password-required.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PasswordRulesComponent, PasswordInputComponent]
})
export class ClientChangePasswordRequiredComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clientAuthApi = inject(ClientAuthApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = this.fb.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(256)]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatch }
  );

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.serverError.set(null);

    const { newPassword } = this.form.getRawValue();

    this.clientAuthApi
      .changePassword({ currentPassword: '', newPassword: newPassword ?? '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.authSession
            .refreshCurrentUser()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => {
                this.loading.set(false);
                void this.router.navigate([this.authSession.resolveHomeRoute()]);
              },
              error: () => {
                this.loading.set(false);
                void this.router.navigate(['/client/contracts']);
              }
            });
        },
        error: (err: unknown) => {
          this.loading.set(false);
          const detail = (err as { error?: { detail?: string } })?.error?.detail;
          this.serverError.set(detail ?? 'Error al cambiar la contraseña. Inténtalo de nuevo.');
        }
      });
  }
}
