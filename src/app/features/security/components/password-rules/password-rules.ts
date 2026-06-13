import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-password-rules',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './password-rules.html',
  styleUrl: './password-rules.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PasswordRulesComponent {
  private readonly _password = signal('');

  @Input()
  set password(value: string) {
    this._password.set(value ?? '');
  }

  readonly minLength = computed(() => this._password().length >= 12);
  readonly hasUpper = computed(() => /[A-Z]/.test(this._password()));
  readonly hasLower = computed(() => /[a-z]/.test(this._password()));
  readonly hasDigit = computed(() => /[0-9]/.test(this._password()));
  readonly hasSymbol = computed(() => /[^A-Za-z0-9]/.test(this._password()));
  readonly classCount = computed(() =>
    [this.hasUpper(), this.hasLower(), this.hasDigit(), this.hasSymbol()].filter(Boolean).length
  );
  readonly classesOk = computed(() => this.classCount() >= 3);
  readonly show = computed(() => this._password().length > 0);
}
