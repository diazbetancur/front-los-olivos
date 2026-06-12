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
  name: string;
  department: string;
  municipality: string;
  status: string;
}

export interface ProjectDetailResponse {
  id: string;
  name: string;
  department: string;
  municipality: string;
  locationReference: string;
  cadastralKey?: string | null;
  totalAreaM2?: number | null;
  status: string;
}

export interface CreateProjectRequest {
  name: string;
  department: string;
  municipality: string;
  locationReference: string;
  cadastralKey?: string | null;
  totalAreaM2?: number | null;
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
  code: string;
  fullCode: string;
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
  areaM2: number;
  areaVr2?: number | null;
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
  notes: string;
}

export interface CreateLotRequest {
  projectId: string;
  blockId?: string | null;
  code: string;
  fullCode: string;
  areaM2: number;
  areaVr2?: number | null;
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
  notes?: string | null;
}

export interface UpdateLotRequest {
  projectId: string;
  blockId?: string | null;
  code: string;
  fullCode: string;
  areaM2: number;
  areaVr2?: number | null;
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
  notes?: string | null;
}

export interface ChangeLotStatusRequest {
  notes?: string | null;
}

export interface LotImportRowPreviewResponse {
  rowNumber: number;
  fullCode: string;
  code: string;
  blockCode?: string | null;
  areaM2: number;
  areaVr2?: number | null;
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
