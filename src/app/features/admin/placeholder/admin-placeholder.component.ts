import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { AdminRouteData } from '../admin-route-data';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';

@Component({
  selector: 'app-admin-placeholder',
  imports: [CommonModule, EmptyStateComponent, HasPermissionDirective],
  templateUrl: './admin-placeholder.component.html',
  styleUrl: './admin-placeholder.component.scss'
})
export class AdminPlaceholderComponent {
  private readonly route = inject(ActivatedRoute);

  readonly pageData$ = this.route.data.pipe(
    map((data) => data as Partial<AdminRouteData>)
  );
}
