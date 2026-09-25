import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthSessionService } from '../../../../core/auth/auth-session.service';
import { AppFeedbackService } from '../../../../core/ui/app-feedback.service';
import { ContractDetailResponse, ContractStatus } from '../../models/contracts.models';
import { ContractsApiService } from '../../services/contracts-api.service';
import { ContractFormPageComponent } from './contract-form-page.component';

describe('ContractFormPageComponent — activación sin firma', () => {
  let component: ContractFormPageComponent;
  let fixture: ComponentFixture<ContractFormPageComponent>;

  const detailWith = (status: ContractStatus): ContractDetailResponse =>
    ({
      id: 'c1',
      contractNumber: 'CTR-20260924-ABC123',
      status,
      signedDocumentStorageKey: null,
      signedDocumentUploadedAtUtc: null
    }) as unknown as ContractDetailResponse;

  const grantPermissions = (...codes: ReadonlyArray<string>): void => {
    const authSession = TestBed.inject(AuthSessionService);
    vi.spyOn(authSession, 'hasPermission').mockImplementation((code: string) => codes.includes(code));
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractFormPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    // Sin detectChanges: ngOnInit dispara los lookups de proyectos/lotes/clientes, que no
    // aportan nada a estas pruebas.
    fixture = TestBed.createComponent(ContractFormPageComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ofrece activar un contrato en Borrador', () => {
    grantPermissions('Contracts.Activate');
    component.selectedContractDetail = detailWith('Borrador');

    expect(component.canActivateContract()).toBe(true);
  });

  it('ofrece activar un contrato Pendiente de firma', () => {
    grantPermissions('Contracts.Activate');
    component.selectedContractDetail = detailWith('PendienteFirma');

    expect(component.canActivateContract()).toBe(true);
  });

  it('no ofrece activar un contrato que ya está Activo', () => {
    grantPermissions('Contracts.Activate');
    component.selectedContractDetail = detailWith('Activo');

    expect(component.canActivateContract()).toBe(false);
  });

  it('no ofrece activar sin el permiso Contracts.Activate', () => {
    grantPermissions('Contracts.Approve');
    component.selectedContractDetail = detailWith('Borrador');

    expect(component.canActivateContract()).toBe(false);
  });

  it('activa el contrato sin pedir el documento firmado', () => {
    grantPermissions('Contracts.Activate');
    const contractsApi = TestBed.inject(ContractsApiService);
    const feedback = TestBed.inject(AppFeedbackService);
    const activated = detailWith('Activo');
    const activateSpy = vi.spyOn(contractsApi, 'activateContract').mockReturnValue(of(activated));
    const uploadSpy = vi.spyOn(contractsApi, 'uploadSignedContract');
    const feedbackSpy = vi.spyOn(feedback, 'show');
    const reloadSpy = vi.spyOn(component, 'viewContractDetail').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

    component.selectedContractDetail = detailWith('Borrador');
    component.activateContract();

    expect(activateSpy).toHaveBeenCalledWith('c1');
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(reloadSpy).toHaveBeenCalledWith('c1');
    expect(feedbackSpy).toHaveBeenCalledWith(expect.objectContaining({ level: 'success' }));
    expect(component.isActivating).toBe(false);
  });

  it('no activa si el usuario cancela la confirmación', () => {
    grantPermissions('Contracts.Activate');
    const contractsApi = TestBed.inject(ContractsApiService);
    const activateSpy = vi.spyOn(contractsApi, 'activateContract');
    vi.spyOn(globalThis, 'confirm').mockReturnValue(false);

    component.selectedContractDetail = detailWith('Borrador');
    component.activateContract();

    expect(activateSpy).not.toHaveBeenCalled();
  });

  it('informa el conflicto cuando el backend rechaza la activación', () => {
    grantPermissions('Contracts.Activate');
    const contractsApi = TestBed.inject(ContractsApiService);
    const feedback = TestBed.inject(AppFeedbackService);
    vi.spyOn(contractsApi, 'activateContract').mockReturnValue(
      throwError(() => ({ status: 409, error: { detail: 'El contrato no puede activarse.' } }))
    );
    const errorSpy = vi.spyOn(feedback, 'showError');
    vi.spyOn(globalThis, 'confirm').mockReturnValue(true);

    component.selectedContractDetail = detailWith('Borrador');
    component.activateContract();

    expect(errorSpy).toHaveBeenCalled();
    expect(component.isActivating).toBe(false);
  });
});
