import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ClientChangePasswordRequiredComponent } from './client-change-password-required.component';

describe('ClientChangePasswordRequiredComponent', () => {
  let component: ClientChangePasswordRequiredComponent;
  let fixture: ComponentFixture<ClientChangePasswordRequiredComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ClientChangePasswordRequiredComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ClientChangePasswordRequiredComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
