import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Observable, Subject, catchError, debounceTime, distinctUntilChanged, of, switchMap } from 'rxjs';

export interface SearchSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './search-select.html',
  styleUrl: './search-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchSelectComponent implements OnInit, OnChanges {
  @Input() searchFn!: (query: string) => Observable<SearchSelectOption[]>;
  @Input() placeholder = 'Buscar...';
  @Input() minChars = 4;
  @Input() clearSignal = 0;

  @Output() selectionChange = new EventEmitter<SearchSelectOption | null>();

  private readonly destroyRef = inject(DestroyRef);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly input$ = new Subject<string>();

  inputValue = '';
  selectedOption: SearchSelectOption | null = null;
  options: SearchSelectOption[] = [];
  state: SearchState = 'idle';
  isOpen = false;

  ngOnInit(): void {
    this.input$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.length < this.minChars) {
            this.state = 'idle';
            this.options = [];
            this.isOpen = false;
            this.syncView();
            return of(null);
          }

          this.state = 'loading';
          this.isOpen = true;
          this.syncView();

          return this.searchFn(query).pipe(
            catchError(() => {
              this.state = 'error';
              this.options = [];
              this.isOpen = true;
              this.syncView();
              return EMPTY;
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((results) => {
        if (results === null) {
          return;
        }

        this.options = results;
        this.state = results.length > 0 ? 'results' : 'empty';
        this.isOpen = true;
        this.syncView();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['clearSignal'] && !changes['clearSignal'].firstChange) {
      this.clear();
    }
  }

  onInput(value: string): void {
    this.inputValue = value;

    if (this.selectedOption) {
      this.selectedOption = null;
      this.selectionChange.emit(null);
    }

    this.input$.next(value);
  }

  onFocusOut(event: FocusEvent): void {
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    const host = event.currentTarget as HTMLElement;
    if (!host.contains(relatedTarget)) {
      this.isOpen = false;
      this.syncView();
    }
  }

  selectOption(option: SearchSelectOption): void {
    this.selectedOption = option;
    this.inputValue = option.label;
    this.isOpen = false;
    this.options = [];
    this.state = 'idle';
    this.selectionChange.emit(option);
    this.syncView();
  }

  clear(): void {
    this.inputValue = '';
    this.selectedOption = null;
    this.options = [];
    this.state = 'idle';
    this.isOpen = false;
    this.selectionChange.emit(null);
    this.syncView();
  }

  private syncView(): void {
    this.changeDetectorRef.markForCheck();
  }
}
