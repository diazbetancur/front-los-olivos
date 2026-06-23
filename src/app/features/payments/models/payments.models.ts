export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export type PaymentStatus = 'Registrado' | 'Aplicado' | 'PendienteRevision' | 'Rechazado' | 'Anulado';
export type ReceiptStatus = 'Emitido' | 'Anulado';
export type PaymentProofStatus = 'PendienteRevision' | 'Aprobado' | 'Rechazado';

export interface PaymentProofSummaryResponse {
  id: string;
  status: string;
  source: string;
  externalReference: string;
  paymentDate: string;
  amount: number;
  currency: string;
  submittedAtUtc: string;
  hasFile: boolean;
}

export interface GetPaymentsQuery {
  contractId?: string | null;
  clientId?: string | null;
  status?: string | null;
  search?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  page: number;
  pageSize: number;
}

export interface PaymentListItemResponse {
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
  paymentMethod: string;
  transactionReference: string;
  contractNumber?: string | null;
  clientFullName?: string | null;
  hasReceipt?: boolean;
}

export interface RegisterPaymentRequest {
  contractId?: string | null;
  clientId?: string | null;
  paymentDate: string;
  amount: number;
  currency?: string | null;
  paymentMethod?: string | null;
  bankName?: string | null;
  transactionReference?: string | null;
  concept?: string | null;
  notes?: string | null;
  confirmCreditBalance?: boolean;
}

export interface ApplyPaymentAllocationRequest {
  contractInstallmentId: string;
  amountApplied: number;
}

export interface ApplyPaymentRequest {
  allocations: ReadonlyArray<ApplyPaymentAllocationRequest>;
}

export interface VoidPaymentRequest {
  reason?: string | null;
}

export interface PaymentAllocationResponse {
  id: string;
  paymentId: string;
  contractId: string;
  contractInstallmentId: string;
  installmentNumber: number;
  amountApplied: number;
  isVoided: boolean;
  appliedAtUtc: string;
  voidedAtUtc?: string | null;
  hasReceipt?: boolean;
  receiptId?: string | null;
}

export interface PaymentDetailResponse {
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
  paymentMethod: string;
  bankName: string;
  transactionReference: string;
  concept: string;
  notes: string;
  voidedAtUtc?: string | null;
  voidReason: string;
  allocations: ReadonlyArray<PaymentAllocationResponse>;
  proofs?: ReadonlyArray<PaymentProofSummaryResponse>;
}

export interface ContractBalanceResponse {
  contractId: string;
  totalScheduled: number;
  totalPaid: number;
  totalRemaining: number;
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
  overdueInstallments: number;
  currency: string;
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

export interface GetReceiptsQuery {
  contractId?: string | null;
  clientId?: string | null;
  paymentId?: string | null;
  status?: string | null;
  search?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  page: number;
  pageSize: number;
}

export interface ReceiptListItemResponse {
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

export interface ReceiptDetailResponse {
  id: string;
  receiptNumber: string;
  paymentId?: string | null;
  contractId?: string | null;
  clientId?: string | null;
  receiptDate: string;
  amount: number;
  currency: string;
  status: string;
  notes: string;
  generatedAtUtc: string;
  generatedBy: string;
  voidedAtUtc?: string | null;
  voidReason: string;
}

export interface VoidReceiptRequest {
  reason?: string | null;
}

export interface ContractLookupItem {
  id: string;
  contractNumber: string;
  clientFullName: string;
  projectId: string;
  lotId: string;
  clientId: string;
  contractDate: string;
  contractAmount: number;
  currency: string;
  status: string;
}

export interface ClientLookupItem {
  id: string;
  fullName: string;
  status: string;
  dni: string;
  rtn: string;
}

export interface PaymentApplyResultResponse {
  applied: boolean;
  requiresCreditConfirmation: boolean;
  projectedCreditBalance: number;
  payment: PaymentDetailResponse | null;
}

export interface ApprovePaymentRequest {
  confirmCreditBalance: boolean;
}

export interface RejectPaymentRequest {
  reason: string;
}
