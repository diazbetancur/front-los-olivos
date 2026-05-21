import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HasPermissionDirective } from '../../../core/auth/has-permission.directive';

@Component({
  selector: 'app-inventory-home',
  imports: [CommonModule, RouterLink, HasPermissionDirective],
  templateUrl: './inventory-home.component.html',
  styleUrl: './inventory-home.component.scss'
})
export class InventoryHomeComponent {}

