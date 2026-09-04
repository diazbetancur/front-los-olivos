import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProjectsPageComponent } from './projects-page.component';
import { ProjectDetailResponse } from '../models/inventory.models';

describe('ProjectsPageComponent', () => {
  let component: ProjectsPageComponent;
  let fixture: ComponentFixture<ProjectsPageComponent>;
  let httpMock: HttpTestingController;

  const projectWithLogo: ProjectDetailResponse = {
    id: 'p1',
    name: 'Residencial Test',
    department: 'Comayagua',
    municipality: 'Comayagua',
    locationReference: 'Ref',
    status: 'Activo',
    logoStorageKey: 'projects/p1/logo.png',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProjectsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectsPageComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    httpMock
      .expectOne(req => req.url === '/api/v1/admin/projects')
      .flush({ items: [], page: 1, pageSize: 20, totalCount: 0 });
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('loads a preview image when the edited project has a logo', () => {
    component.openEditForm('p1');
    httpMock.expectOne('/api/v1/admin/projects/p1').flush(projectWithLogo);

    httpMock
      .expectOne('/api/v1/admin/projects/p1/logo')
      .flush(new Blob(['fake-image'], { type: 'image/png' }));

    expect(component.logoPreviewUrl).toContain('blob:');
  });

  it('does not request a logo when the edited project has none', () => {
    component.openEditForm('p2');
    httpMock
      .expectOne('/api/v1/admin/projects/p2')
      .flush({ ...projectWithLogo, id: 'p2', logoStorageKey: null });

    httpMock.expectNone('/api/v1/admin/projects/p2/logo');
    expect(component.logoPreviewUrl).toBeNull();
  });

  it('revokes the preview url when the form is cancelled', () => {
    component.openEditForm('p1');
    httpMock.expectOne('/api/v1/admin/projects/p1').flush(projectWithLogo);
    httpMock
      .expectOne('/api/v1/admin/projects/p1/logo')
      .flush(new Blob(['fake-image'], { type: 'image/png' }));
    expect(component.logoPreviewUrl).not.toBeNull();

    component.cancelForm();
    expect(component.logoPreviewUrl).toBeNull();
  });

  it('explains on the location field that the contract already adds the municipality', async () => {
    // El dato real se cargo con la frase completa pegada ("ubicada en el lugar denominado ...,
    // en el municipio de Comayagua, departamento de Comayagua"), que el contrato volvia a
    // agregar. La ayuda del campo existe para que no se repita.
    component.openCreateForm();
    // En modo zoneless, llamar el metodo directo no marca la vista sucia como lo haria el click
    // del boton, y el @if del modal no se renderiza.
    fixture.changeDetectorRef.markForCheck();
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const textarea = host.querySelector<HTMLTextAreaElement>(
      'textarea[formControlName="locationReference"]',
    );
    expect(textarea).toBeTruthy();
    expect(textarea!.placeholder).toBe('Lo de Vaca, Sector de Las Liconas');

    const hint = textarea!.parentElement!.querySelector<HTMLElement>('.ui-field-hint');
    expect(hint).toBeTruthy();
    expect(hint!.textContent).toContain('ubicada en el lugar denominado');
    expect(hint!.textContent).toContain('No repitas aqui el municipio ni el departamento');
  });
});
