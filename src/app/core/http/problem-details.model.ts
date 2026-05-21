export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  errors?: Record<string, string[]>;
  traceId?: string;
}

export interface NormalizedApiError {
  status: number;
  title: string;
  detail: string;
  fieldErrors: string[];
  userMessage: string;
}

