export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export interface LotStatusSummaryResponse {
  status: string;
  count: number;
  totalAreaM2: number;
  totalListPrice: number;
}

export interface ContractStatusSummaryResponse {
  status: string;
  count: number;
  totalContractAmount: number;
}

export interface GetContractsInArrearsQuery {
  asOfDate?: string | null;
  upcomingDays?: number | null;
  projectId?: string | null;
  search?: string | null;
  page: number;
  pageSize: number;
}

export interface ContractInArrearsResponse {
  contractId: string;
  contractNumber: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId: string;
  clientFullName: string;
  contractStatus: string;
  overdueInstallments: number;
  overdueAmount: number;
  upcomingInstallments: number;
  upcomingAmount: number;
  oldestOverdueDate?: string | null;
  nextDueDate?: string | null;
}

export interface GetPaymentsByDateRangeQuery {
  fromDate?: string | null;
  toDate?: string | null;
  contractId?: string | null;
  clientId?: string | null;
  page: number;
  pageSize: number;
}

export interface PaymentByDateRangeItemResponse {
  paymentId: string;
  paymentNumber: string;
  paymentDate: string;
  contractId?: string | null;
  clientId?: string | null;
  amount: number;
  appliedAmount: number;
  unallocatedAmount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  transactionReference: string;
  concept: string;
}

export interface PaymentsByDateRangeResponse {
  items: ReadonlyArray<PaymentByDateRangeItemResponse>;
  page: number;
  pageSize: number;
  totalCount: number;
  totalAmount: number;
  totalAppliedAmount: number;
  totalUnallocatedAmount: number;
  totalVoidedCount: number;
}

export interface GetProjectBalanceSummaryQuery {
  search?: string | null;
  page: number;
  pageSize: number;
}

export interface ProjectBalanceSummaryResponse {
  projectId: string;
  projectCode: string;
  projectName: string;
  contractsCount: number;
  inDefaultContracts: number;
  scheduledAmount: number;
  paidAmount: number;
  remainingAmount: number;
}

export interface GetVoidedReceiptsQuery {
  fromDate?: string | null;
  toDate?: string | null;
  search?: string | null;
  page: number;
  pageSize: number;
}

export interface VoidedReceiptResponse {
  receiptId: string;
  receiptNumber: string;
  receiptDate: string;
  amount: number;
  currency: string;
  paymentId?: string | null;
  contractId?: string | null;
  clientId?: string | null;
  voidedAtUtc?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  notes: string;
}

export interface GetAuditLogsQuery {
  fromUtc?: string | null;
  toUtc?: string | null;
  userName?: string | null;
  entityName?: string | null;
  action?: string | null;
  page: number;
  pageSize: number;
}

export interface AuditLogListItemResponse {
  id: string;
  createdAtUtc: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  entityName: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface ProjectLookupItem {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface ContractLookupItem {
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

export interface ClientLookupItem {
  id: string;
  fullName: string;
  status: string;
  dni: string;
  rtn: string;
}
