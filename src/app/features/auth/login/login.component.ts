import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSessionService } from '../../../core/auth/auth-session.service';
import { ApiErrorService } from '../../../core/http/api-error.service';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authSession = inject(AuthSessionService);
  private readonly apiErrorService = inject(ApiErrorService);
  private readonly feedback = inject(AppFeedbackService);

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    identifier: ['', [Validators.required, Validators.maxLength(128)]],
    password: ['', [Validators.required, Validators.maxLength(256)]]
  });

  ngOnInit(): void {
    this.feedback.clear();
    if (this.authSession.isAuthenticated()) {
      void this.router.navigateByUrl(this.resolvePostLoginRoute());
    }
  }

  submit(): void {
    this.errorMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    const request = this.form.getRawValue();

    this.authSession
      .login(request)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false))
      )
      .subscribe({
        next: () => {
          this.feedback.clear();
          void this.router.navigateByUrl(this.resolvePostLoginRoute());
        },
        error: (error) => {
          const normalizedError = this.apiErrorService.normalize(error);
          const firstFieldError = normalizedError.fieldErrors[0];
          this.errorMessage.set(firstFieldError ?? normalizedError.userMessage);
        }
      });
  }

  private resolvePostLoginRoute(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl')?.trim();
    if (!returnUrl) {
      return this.authSession.resolveHomeRoute();
    }

    // Prevent external or malformed redirect targets.
    const isInternalPath = returnUrl.startsWith('/') && !returnUrl.startsWith('//');
    if (!isInternalPath || returnUrl.startsWith('/login')) {
      return this.authSession.resolveHomeRoute();
    }

    return returnUrl;
  }
}
