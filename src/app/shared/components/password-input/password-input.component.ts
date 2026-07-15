import { Component, ChangeDetectionStrategy, input, output, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { signal } from '@angular/core';

@Component({
  selector: 'app-password-input',
  templateUrl: './password-input.component.html',
  styleUrl: './password-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PasswordInputComponent),
      multi: true,
    },
  ],
})
export class PasswordInputComponent implements ControlValueAccessor {
  readonly id = input<string>('');
  readonly placeholder = input<string>('');
  readonly autocomplete = input<string>('current-password');
  readonly ariaDescribedBy = input<string>('');
  readonly ariaInvalid = input<boolean | null>(null);

  readonly showPassword = signal(false);
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private value = '';

  writeValue(obj: string): void {
    this.value = obj || '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.value = input.value;
    this.onChange(this.value);
  }

  onInputBlur(): void {
    this.onTouched();
  }

  toggleShowPassword(): void {
    this.showPassword.update(val => !val);
  }
}
