import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientAuthApiService } from '../../services/client-auth-api.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';

@Component({
  selector: 'app-client-register',
  templateUrl: './client-register.component.html',
  styleUrl: './client-register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink]
})
export class ClientRegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clientAuthApi = inject(ClientAuthApiService);
  private readonly router = inject(Router);
  private readonly feedback = inject(AppFeedbackService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly success = signal(false);

  readonly form = this.fb.nonNullable.group({
    documentNumber: ['', [Validators.required, Validators.maxLength(50)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    password: ['', [Validators.required, Validators.minLength(12), Validators.maxLength(256)]],
    confirmPassword: ['', [Validators.required]]
  });

  get passwordMismatch(): boolean {
    const { password, confirmPassword } = this.form.getRawValue();
    return confirmPassword.length > 0 && password !== confirmPassword;
  }

  submit(): void {
    if (this.form.invalid || this.passwordMismatch || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.serverError.set(null);

    const { documentNumber, email, password, confirmPassword } = this.form.getRawValue();

    this.clientAuthApi
      .register({ documentNumber, email, password, confirmPassword })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.success.set(true);
        },
        error: (err: unknown) => {
          this.loading.set(false);
          const error = err as { status?: number; error?: { detail?: string } };
          if (error.status === 409) {
            this.serverError.set('Ya tienes una cuenta registrada. Inicia sesión.');
          } else if (error.status === 404) {
            this.serverError.set(
              'Tu documento no está registrado en nuestro sistema. Dirígete a Los Olivos para actualizar tus datos.'
            );
          } else {
            this.serverError.set(error.error?.detail ?? 'Error al crear la cuenta. Inténtalo de nuevo.');
          }
        }
      });
  }
}
