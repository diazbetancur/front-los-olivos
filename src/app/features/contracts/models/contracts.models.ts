export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export type ContractStatus =
  | 'Borrador'
  | 'PendienteFirma'
  | 'Activo'
  | 'EnMora'
  | 'Pagado'
  | 'Cerrado'
  | 'Rescindido'
  | 'Anulado';

export interface GetContractsQuery {
  page: number;
  pageSize: number;
  projectId?: string | null;
  lotId?: string | null;
  clientId?: string | null;
  status?: string | null;
  search?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface GetProjectContractsQuery {
  projectId: string;
  page: number;
  pageSize: number;
  status?: string | null;
  search?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
}

export interface ContractListItemResponse {
  id: string;
  contractNumber: string;
  projectId: string;
  lotId: string;
  clientId: string;
  contractDate: string;
  contractAmount: number;
  currency: string;
  status: string;
}

export interface ContractClientSnapshotResponse {
  id: string;
  clientFullName: string;
  clientDni: string;
  clientRtn: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
}

export interface ContractLotSnapshotResponse {
  id: string;
  projectName: string;
  lotFullCode: string;
  lotAreaM2: number;
  lotAreaV2?: number | null;
  northMeasure?: number | null;
  northBoundary: string;
  southMeasure?: number | null;
  southBoundary: string;
  eastMeasure?: number | null;
  eastBoundary: string;
  westMeasure?: number | null;
  westBoundary: string;
  contractAmount: number;
  monthlyPayment: number;
  termMonths: number;
  startDate: string;
  endDate?: string | null;
}

export interface ContractBeneficiarySnapshotResponse {
  id: string;
  fullName: string;
  dni: string;
  phone: string;
  relationship: string;
  address: string;
  notes: string;
}

export interface ContractDetailResponse {
  id: string;
  contractNumber: string;
  projectId: string;
  lotId: string;
  clientId: string;
  contractDate: string;
  startDate: string;
  endDate?: string | null;
  termMonths: number;
  contractAmount: number;
  downPayment: number;
  monthlyPayment: number;
  interestRate: number;
  lateFeeRate: number;
  lateFeeRateEnabled: boolean;
  annualTotalCost: number;
  purchaseOptionValue: number;
  monthlyPaymentDay: number;
  currency: string;
  status: string;
  specialConditionText: string;
  discountPreparedAmount?: number | null;
  discountPreparedDeadline?: string | null;
  discountPreparedEnabled: boolean;
  notes: string;
  clientSnapshot?: ContractClientSnapshotResponse | null;
  lotSnapshot?: ContractLotSnapshotResponse | null;
  beneficiarySnapshots: ReadonlyArray<ContractBeneficiarySnapshotResponse>;
}

export interface CreateContractRequest {
  projectId: string;
  lotId: string;
  clientId: string;
  contractDate: string;
  startDate: string;
  termMonths: number;
  contractAmount: number;
  downPayment: number;
  monthlyPayment: number;
  interestRate: number;
  lateFeeRate?: number | null;
  lateFeeRateEnabled?: boolean | null;
  annualTotalCost?: number | null;
  purchaseOptionValue?: number | null;
  monthlyPaymentDay: number;
  currency?: string | null;
  specialConditionText?: string | null;
  discountPreparedAmount?: number | null;
  discountPreparedDeadline?: string | null;
  discountPreparedEnabled?: boolean | null;
  notes?: string | null;
}

export interface UpdateContractStatusRequest {
  status: string;
  notes?: string | null;
}

export interface CancelContractRequest {
  notes?: string | null;
}

export interface ContractInstallmentResponse {
  id: string;
  contractId: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  lateFeeAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
}

export interface GeneratedDocumentResponse {
  id: string;
  entityType: string;
  entityId: string;
  templateId: string;
  documentType: string;
  pdfUrl: string;
  docxUrl: string;
  generatedAt: string;
  generatedBy: string;
}

export interface GenerateContractDocumentsResponse {
  contractId: string;
  generatedCount: number;
  documents: ReadonlyArray<GeneratedDocumentResponse>;
}

export interface ProjectLookupItem {
  id: string;
  name: string;
  status: string;
}

export interface LotLookupItem {
  id: string;
  projectId: string;
  fullCode: string;
  number: string;
  status: string;
  currency: string;
  listPrice: number;
}

export interface ClientLookupItem {
  id: string;
  fullName: string;
  status: string;
  dni: string;
  rtn: string;
}
