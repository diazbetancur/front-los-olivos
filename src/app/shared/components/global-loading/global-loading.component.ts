import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { GlobalLoadingService } from '../../../core/ui/global-loading.service';

@Component({
  selector: 'app-global-loading',
  imports: [CommonModule],
  templateUrl: './global-loading.component.html',
  styleUrl: './global-loading.component.scss'
})
export class GlobalLoadingComponent {
  protected readonly loading = inject(GlobalLoadingService);
}
