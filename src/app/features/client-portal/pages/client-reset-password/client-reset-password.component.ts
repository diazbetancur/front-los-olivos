import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientAuthApiService } from '../../services/client-auth-api.service';
import { PasswordRulesComponent } from '../../../security/components/password-rules/password-rules';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPw = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return newPw === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-client-reset-password',
  templateUrl: './client-reset-password.component.html',
  styleUrl: './client-reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, PasswordRulesComponent]
})
export class ClientResetPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clientAuthApi = inject(ClientAuthApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  private readonly token = this.route.snapshot.queryParamMap.get('token') ?? '';

  readonly hasToken = this.token.length > 0;
  readonly loading = signal(false);
  readonly success = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = this.fb.group(
    {
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(256)]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatch }
  );

  submit(): void {
    if (!this.hasToken || this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.serverError.set(null);

    const { newPassword } = this.form.getRawValue();

    this.clientAuthApi
      .resetPassword({ token: this.token, newPassword: newPassword ?? '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.success.set(true);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          const errors = (err as { error?: { errors?: { token?: string[] } } })?.error?.errors;
          this.serverError.set(
            errors?.token?.[0] ?? 'El enlace de recuperación no es válido o ha expirado.'
          );
        }
      });
  }
}
