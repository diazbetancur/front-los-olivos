export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export type ClientPersonType = 'Natural' | 'Juridica';
export type ClientStatus = 'Activo' | 'Inactivo' | 'Bloqueado';

export interface GetClientsQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  dni?: string | null;
  contractNumber?: string | null;
}

export interface ClientListItemResponse {
  id: string;
  fullName: string;
  dni: string;
  rtn: string;
  phone: string;
  mobile: string;
  email: string;
  department: string;
  municipality: string;
  status: string;
}

export interface ClientDetailResponse {
  id: string;
  personType: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dni: string;
  rtn: string;
  nationality: string;
  maritalStatus: string;
  birthDate?: string | null;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  department: string;
  municipality: string;
  status: string;
  notes: string;
}

export interface CreateClientRequest {
  personType: string;
  firstName: string;
  lastName?: string | null;
  dni?: string | null;
  rtn?: string | null;
  nationality?: string | null;
  maritalStatus?: string | null;
  birthDate?: string | null;
  phone?: string | null;
  mobile?: string | null;
  email?: string | null;
  address?: string | null;
  department?: string | null;
  municipality?: string | null;
  status?: string | null;
  notes?: string | null;
}

export interface UpdateClientRequest extends CreateClientRequest {}

export interface ClientBeneficiaryResponse {
  id: string;
  clientId: string;
  fullName: string;
  dni: string;
  phone: string;
  relationship: string;
  address: string;
  notes: string;
}

export interface CreateClientBeneficiaryRequest {
  fullName: string;
  dni?: string | null;
  phone?: string | null;
  relationship?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface UpdateClientBeneficiaryRequest extends CreateClientBeneficiaryRequest {}

export interface ClientReferenceResponse {
  id: string;
  clientId: string;
  fullName: string;
  phone: string;
  relationshipOrNotes: string;
  notes: string;
}

export interface CreateClientReferenceRequest {
  fullName: string;
  phone?: string | null;
  relationshipOrNotes?: string | null;
  notes?: string | null;
}

export interface UpdateClientReferenceRequest extends CreateClientReferenceRequest {}
