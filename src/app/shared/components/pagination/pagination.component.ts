import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.scss'
})
export class PaginationComponent {
  readonly currentPage = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly pageSize = input<number>(20);

  readonly pageChange = output<number>();
  readonly pageSizeChange = output<number>();

  readonly pageSizes = [10, 20, 50] as const;

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalCount() / this.pageSize()))
  );

  readonly rangeLabel = computed(() => {
    if (this.totalCount() === 0) return 'Sin resultados';
    const start = (this.currentPage() - 1) * this.pageSize() + 1;
    const end = Math.min(this.currentPage() * this.pageSize(), this.totalCount());
    return `${start}–${end} de ${this.totalCount()}`;
  });

  readonly pageNumbers = computed<(number | null)[]>(() => {
    const total = this.totalPages();
    const current = this.currentPage();

    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    const pages: (number | null)[] = [1];

    if (current > 3) pages.push(null);

    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);
    for (let p = from; p <= to; p++) pages.push(p);

    if (current < total - 2) pages.push(null);

    pages.push(total);
    return pages;
  });

  navigateTo(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.currentPage()) return;
    this.pageChange.emit(page);
  }

  onSizeChange(event: Event): void {
    const value = +(event.target as HTMLSelectElement).value;
    if (value > 0) this.pageSizeChange.emit(value);
  }
}
