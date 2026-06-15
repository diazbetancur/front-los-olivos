export interface ClientRegisterRequest {
  documentNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface ClientLoginRequest {
  documentNumber: string;
  password: string;
}

export interface ChangeClientPasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ClientProfileResponse {
  firstName: string;
  lastName: string;
  fullName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  mobile: string | null;
  address: string | null;
  maritalStatus: string | null;
  gender: string | null;
  birthDate: string | null;
  nationality: string | null;
}

export interface UpdateClientProfileRequest {
  email: string;
  mobile: string | null;
  address: string | null;
  maritalStatus: string | null;
  gender: string | null;
  birthDate: string | null;
  nationality: string | null;
}
