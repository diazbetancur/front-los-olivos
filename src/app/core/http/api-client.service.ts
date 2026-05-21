import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface ApiRequestOptions {
  headers?: HttpHeaders | Record<string, string | string[]>;
  params?: HttpParams | Record<string, string | number | boolean | ReadonlyArray<string | number | boolean>>;
  context?: HttpContext;
}

@Injectable({ providedIn: 'root' })
export class ApiClientService {
  constructor(private readonly http: HttpClient) {}

  get<TResponse>(path: string, options?: ApiRequestOptions): Observable<TResponse> {
    return this.http.get<TResponse>(path, options);
  }

  post<TRequest, TResponse>(path: string, body: TRequest, options?: ApiRequestOptions): Observable<TResponse> {
    return this.http.post<TResponse>(path, body, options);
  }

  put<TRequest, TResponse>(path: string, body: TRequest, options?: ApiRequestOptions): Observable<TResponse> {
    return this.http.put<TResponse>(path, body, options);
  }

  patch<TRequest, TResponse>(path: string, body: TRequest, options?: ApiRequestOptions): Observable<TResponse> {
    return this.http.patch<TResponse>(path, body, options);
  }

  delete<TResponse>(path: string, options?: ApiRequestOptions): Observable<TResponse> {
    return this.http.delete<TResponse>(path, options);
  }
}

