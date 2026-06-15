import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ClientAuthApiService } from '../../services/client-auth-api.service';
import { ClientProfileResponse } from '../../models/client-auth.models';
import { PasswordRulesComponent } from '../../../../features/security/components/password-rules/password-rules';

function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPw = group.get('newPassword')?.value as string;
  const confirm = group.get('confirmPassword')?.value as string;
  return newPw === confirm ? null : { mismatch: true };
}

@Component({
  selector: 'app-client-profile',
  templateUrl: './client-profile.component.html',
  styleUrl: './client-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PasswordRulesComponent]
})
export class ClientProfileComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly clientAuthApi = inject(ClientAuthApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly profileSaving = signal(false);
  readonly passwordSaving = signal(false);
  readonly profile = signal<ClientProfileResponse | null>(null);
  readonly loadError = signal<string | null>(null);
  readonly profileSuccess = signal(false);
  readonly profileError = signal<string | null>(null);
  readonly passwordSuccess = signal(false);
  readonly passwordError = signal<string | null>(null);
  readonly activeTab = signal<'profile' | 'password'>('profile');

  readonly showCurrent = signal(false);
  readonly showNew = signal(false);
  readonly showConfirm = signal(false);

  readonly profileForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(256)]],
    mobile: ['', [Validators.maxLength(30)]],
    address: ['', [Validators.maxLength(300)]],
    maritalStatus: [''],
    gender: [''],
    birthDate: [''],
    nationality: ['', [Validators.maxLength(100)]]
  });

  readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(256)]],
      confirmPassword: ['', [Validators.required]]
    },
    { validators: passwordsMatch }
  );

  ngOnInit(): void {
    this.clientAuthApi
      .getProfile()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.loading.set(false);
          this.profileForm.patchValue({
            email: profile.email,
            mobile: profile.mobile ?? '',
            address: profile.address ?? '',
            maritalStatus: profile.maritalStatus ?? '',
            gender: profile.gender ?? '',
            birthDate: profile.birthDate ?? '',
            nationality: profile.nationality ?? ''
          });
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set('Error al cargar el perfil. Recarga la página.');
        }
      });
  }

  saveProfile(): void {
    if (this.profileForm.invalid || this.profileSaving()) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.profileSaving.set(true);
    this.profileSuccess.set(false);
    this.profileError.set(null);

    const raw = this.profileForm.getRawValue();
    this.clientAuthApi
      .updateProfile({
        email: raw.email,
        mobile: raw.mobile || null,
        address: raw.address || null,
        maritalStatus: raw.maritalStatus || null,
        gender: raw.gender || null,
        birthDate: raw.birthDate || null,
        nationality: raw.nationality || null
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.profile.set(updated);
          this.profileSaving.set(false);
          this.profileSuccess.set(true);
        },
        error: () => {
          this.profileSaving.set(false);
          this.profileError.set('Error al guardar el perfil. Inténtalo de nuevo.');
        }
      });
  }

  changePassword(): void {
    if (this.passwordForm.invalid || this.passwordSaving()) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    this.passwordSaving.set(true);
    this.passwordError.set(null);
    this.passwordSuccess.set(false);

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();

    this.clientAuthApi
      .changePassword({ currentPassword: currentPassword ?? '', newPassword: newPassword ?? '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.passwordSaving.set(false);
          this.passwordSuccess.set(true);
          this.passwordForm.reset();
          this.showCurrent.set(false);
          this.showNew.set(false);
          this.showConfirm.set(false);
        },
        error: (err: unknown) => {
          this.passwordSaving.set(false);
          const errors = (err as { error?: { errors?: { currentPassword?: string[] } } })?.error?.errors;
          this.passwordError.set(errors?.currentPassword?.[0] ?? 'Error al cambiar la contraseña.');
        }
      });
  }
}
