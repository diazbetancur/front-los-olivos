export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface GetClientContractsQuery {
  status?: string | null;
  search?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  page: number;
  pageSize: number;
}

export interface ClientContractListItem {
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

export interface ClientContractSnapshot {
  id: string;
  clientFullName: string;
  clientDni: string;
  clientRtn: string;
  clientAddress: string;
  clientPhone: string;
  clientEmail: string;
}

export interface LotSnapshot {
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

export interface ContractBeneficiarySnapshot {
  id: string;
  fullName: string;
  dni: string;
  phone: string;
  relationship: string;
  address: string;
  notes: string;
}

export interface ClientContractDetail {
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
  specialConditionText?: string | null;
  discountPreparedAmount?: number | null;
  discountPreparedDeadline?: string | null;
  discountPreparedEnabled: boolean;
  notes?: string | null;
  clientSnapshot?: ClientContractSnapshot | null;
  lotSnapshot?: LotSnapshot | null;
  beneficiarySnapshots: ReadonlyArray<ContractBeneficiarySnapshot>;
}

export interface ContractInstallmentItem {
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

export interface ClientPaymentListItem {
  id: string;
  paymentNumber: string;
  contractId?: string | null;
  clientId?: string | null;
  paymentDate: string;
  amount: number;
  appliedAmount: number;
  unallocatedAmount: number;
  currency: string;
  status: string;
  paymentMethod?: string | null;
  transactionReference?: string | null;
}

export interface ClientReceiptListItem {
  id: string;
  receiptNumber: string;
  paymentId?: string | null;
  contractId?: string | null;
  clientId?: string | null;
  receiptDate: string;
  amount: number;
  currency: string;
  status: string;
  generatedAtUtc: string;
}

export interface UploadClientPaymentProofRequest {
  paymentDate: string;
  amount: number;
  currency?: string | null;
  externalReference?: string | null;
  notes?: string | null;
  file: File;
}

export interface ClientPaymentProofDetail {
  id: string;
  paymentId?: string | null;
  contractId?: string | null;
  clientId?: string | null;
  paymentDate: string;
  amount: number;
  currency: string;
  status: string;
  source: string;
  externalReference?: string | null;
  storageUrl: string;
  notes?: string | null;
  submittedAtUtc: string;
  reviewedAtUtc?: string | null;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
}
