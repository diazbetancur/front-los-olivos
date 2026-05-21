import { Directive, Input, TemplateRef, ViewContainerRef, effect, inject, signal } from '@angular/core';
import { AuthSessionService } from './auth-session.service';

@Directive({
  selector: '[appHasPermission]',
  standalone: true
})
export class HasPermissionDirective {
  private readonly templateRef = inject(TemplateRef<unknown>);
  private readonly viewContainer = inject(ViewContainerRef);
  private readonly authSession = inject(AuthSessionService);

  private readonly requiredPermissions = signal<ReadonlyArray<string>>([]);
  private readonly requiresAll = signal(false);
  private hasView = false;

  constructor() {
    effect(() => {
      const permissions = this.requiredPermissions();
      const currentPermissions = new Set(this.authSession.permissions());
      const requireAll = this.requiresAll();

      const shouldRender = permissions.length === 0
        || (requireAll
          ? permissions.every((permission) => currentPermissions.has(permission))
          : permissions.some((permission) => currentPermissions.has(permission)));

      if (shouldRender && !this.hasView) {
        this.viewContainer.createEmbeddedView(this.templateRef);
        this.hasView = true;
        return;
      }

      if (!shouldRender && this.hasView) {
        this.viewContainer.clear();
        this.hasView = false;
      }
    });
  }

  @Input('appHasPermission')
  set appHasPermission(value: string | ReadonlyArray<string> | null | undefined) {
    if (!value) {
      this.requiredPermissions.set([]);
      return;
    }

    this.requiredPermissions.set(Array.isArray(value) ? value : [value]);
  }

  @Input('appHasPermissionRequireAll')
  set appHasPermissionRequireAll(value: boolean | '' | null | undefined) {
    this.requiresAll.set(value === '' || value === true);
  }
}
