export interface PagedResult<TItem> {
  items: ReadonlyArray<TItem>;
  page: number;
  pageSize: number;
  totalCount: number;
}

export type ProjectStatus = 'Activo' | 'Inactivo';
export type LotStatus =
  | 'Disponible'
  | 'Reservado'
  | 'Contratado'
  | 'Pagado'
  | 'Bloqueado'
  | 'Anulado';

export interface GetProjectsQuery {
  page: number;
  pageSize: number;
  search?: string | null;
  status?: string | null;
}

export interface ProjectListItemResponse {
  id: string;
  code: string;
  name: string;
  department: string;
  municipality: string;
  status: string;
}

export interface ProjectDetailResponse {
  id: string;
  code: string;
  name: string;
  description: string;
  department: string;
  municipality: string;
  locationReference: string;
  cadastralKey: string;
  totalAreaM2: number;
  status: string;
}

export interface CreateProjectRequest {
  code: string;
  name: string;
  description?: string | null;
  department: string;
  municipality: string;
  locationReference: string;
  cadastralKey: string;
  totalAreaM2: number;
  status: string;
}

export interface UpdateProjectRequest extends CreateProjectRequest {}

export interface GetLotsQuery {
  projectId?: string | null;
  blockId?: string | null;
  status?: string | null;
  search?: string | null;
  minArea?: number | null;
  maxArea?: number | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  page: number;
  pageSize: number;
}

export interface LotListItemResponse {
  id: string;
  projectId: string;
  blockId?: string | null;
  fullCode: string;
  number: string;
  areaM2: number;
  listPrice: number;
  currency: string;
  status: string;
}

export interface LotDetailResponse {
  id: string;
  projectId: string;
  blockId?: string | null;
  code: string;
  fullCode: string;
  number: string;
  areaM2: number;
  areaV2?: number | null;
  northMeasure?: number | null;
  northBoundary: string;
  southMeasure?: number | null;
  southBoundary: string;
  eastMeasure?: number | null;
  eastBoundary: string;
  westMeasure?: number | null;
  westBoundary: string;
  listPrice: number;
  currency: string;
  status: string;
  intendedUse: string;
  notes: string;
}

export interface CreateLotRequest {
  projectId: string;
  blockId?: string | null;
  code: string;
  fullCode: string;
  number: string;
  areaM2: number;
  areaV2?: number | null;
  northMeasure?: number | null;
  northBoundary: string;
  southMeasure?: number | null;
  southBoundary: string;
  eastMeasure?: number | null;
  eastBoundary: string;
  westMeasure?: number | null;
  westBoundary: string;
  listPrice: number;
  currency?: string | null;
  status?: string | null;
  intendedUse: string;
  notes?: string | null;
}

export interface UpdateLotRequest {
  projectId: string;
  blockId?: string | null;
  code: string;
  fullCode: string;
  number: string;
  areaM2: number;
  areaV2?: number | null;
  northMeasure?: number | null;
  northBoundary: string;
  southMeasure?: number | null;
  southBoundary: string;
  eastMeasure?: number | null;
  eastBoundary: string;
  westMeasure?: number | null;
  westBoundary: string;
  listPrice: number;
  currency?: string | null;
  intendedUse: string;
  notes?: string | null;
}

export interface ChangeLotStatusRequest {
  notes?: string | null;
}

export interface LotImportRowPreviewResponse {
  rowNumber: number;
  fullCode: string;
  code: string;
  number: string;
  blockCode?: string | null;
  isValid: boolean;
  errors: ReadonlyArray<string>;
}

export interface LotImportPreviewResponse {
  previewId: string;
  expiresAtUtc: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: ReadonlyArray<LotImportRowPreviewResponse>;
}

export interface LotImportConfirmRequest {
  previewId: string;
}

export interface LotImportConfirmResponse {
  previewId: string;
  isSuccess: boolean;
  persistedRows: number;
  rows: ReadonlyArray<LotImportRowPreviewResponse>;
}
