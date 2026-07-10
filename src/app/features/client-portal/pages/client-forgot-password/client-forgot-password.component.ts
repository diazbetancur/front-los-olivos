import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientAuthApiService } from '../../services/client-auth-api.service';

@Component({
  selector: 'app-client-forgot-password',
  templateUrl: './client-forgot-password.component.html',
  styleUrl: './client-forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink]
})
export class ClientForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly clientAuthApi = inject(ClientAuthApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly serverError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]]
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.serverError.set(null);

    const { email } = this.form.getRawValue();

    // El backend siempre responde 200 con el mismo mensaje genérico, exista o no la cuenta
    // (anti-enumeración). Un error aquí es una falla real (red, servidor) — no se disfraza de éxito.
    this.clientAuthApi
      .forgotPassword({ email })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.submitted.set(true);
        },
        error: () => {
          this.loading.set(false);
          this.serverError.set('No fue posible procesar la solicitud. Inténtalo de nuevo.');
        }
      });
  }
}
