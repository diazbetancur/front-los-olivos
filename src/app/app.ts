import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppFeedbackService } from './core/ui/app-feedback.service';
import { GlobalLoadingComponent } from './shared/components/global-loading/global-loading.component';
import { ToastContainerComponent } from './shared/components/toast-container/toast-container.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, ToastContainerComponent, GlobalLoadingComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly feedback = inject(AppFeedbackService);
}
