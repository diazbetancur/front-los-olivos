import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { AppFeedbackService } from '../../../core/ui/app-feedback.service';

@Component({
  selector: 'app-toast-container',
  imports: [CommonModule],
  templateUrl: './toast-container.component.html',
  styleUrl: './toast-container.component.scss'
})
export class ToastContainerComponent {
  protected readonly feedback = inject(AppFeedbackService);

  protected dismiss(id: string): void {
    this.feedback.clear(id);
  }

  protected toastClass(level: string): string {
    switch (level) {
      case 'success':
        return 'toast success';
      case 'error':
        return 'toast error';
      case 'warning':
        return 'toast warning';
      default:
        return 'toast info';
    }
  }
}
