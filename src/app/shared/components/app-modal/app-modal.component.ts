import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  Output,
  ViewChild,
  inject
} from '@angular/core';
import { DOCUMENT } from '@angular/common';

let nextModalId = 0;

@Component({
  selector: 'app-modal',
  imports: [CommonModule],
  templateUrl: './app-modal.component.html',
  styleUrl: './app-modal.component.scss'
})
export class AppModalComponent implements AfterViewInit, OnDestroy {
  private readonly document = inject(DOCUMENT);

  @Input() closeOnBackdrop = true;
  @Input() maxWidth = '1020px';
  @Input() titleId: string = `app-modal-title-${++nextModalId}`;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('panel', { static: true }) panel!: ElementRef<HTMLElement>;

  private previouslyFocused: HTMLElement | null = null;

  ngAfterViewInit(): void {
    this.previouslyFocused = (this.document.activeElement as HTMLElement | null) ?? null;
    queueMicrotask(() => this.focusFirstElement());
  }

  ngOnDestroy(): void {
    this.previouslyFocused?.focus?.();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('document:keydown.tab', ['$event'])
  onTab(event: Event): void {
    // Angular 21's strict host-binding inference types $event as Event; narrow at runtime.
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (!this.panel?.nativeElement) {
      return;
    }
    const focusable = this.getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const active = this.document.activeElement as HTMLElement | null;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  protected onBackdropClick(): void {
    if (this.closeOnBackdrop) {
      this.close();
    }
  }

  private focusFirstElement(): void {
    const focusable = this.getFocusableElements();
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      this.panel?.nativeElement?.focus?.();
    }
  }

  private getFocusableElements(): HTMLElement[] {
    if (!this.panel?.nativeElement) {
      return [];
    }
    const selectors =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.from(this.panel.nativeElement.querySelectorAll<HTMLElement>(selectors)).filter(
      (el) => !el.hasAttribute('aria-hidden') && el.offsetParent !== null
    );
  }
}
