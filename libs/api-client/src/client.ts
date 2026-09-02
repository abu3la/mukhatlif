let baseUrl = 'http://localhost:8787';
let authToken: string | null = null;
let devUserId: string | null = null;

export interface ApiConfig {
  baseUrl?: string;
  /**
   * Development identity forwarded as `x-dev-user` when the API runs without
   * Supabase credentials. Ignored by the API once real auth is configured.
   */
  devUserId?: string | null;
}

export function configureApi(config: ApiConfig): void {
  if (config.baseUrl !== undefined) baseUrl = config.baseUrl.replace(/\/$/, '');
  if (config.devUserId !== undefined) devUserId = config.devUserId;
}

/** Supabase Auth access token; sent as a Bearer header on every request. */
export function setAuthToken(token: string | null): void {
  authToken = token;
}

/** Absolute URL for an API path — e.g. an episode's audio stream for a player src. */
export function apiUrl(path: string): string {
  return `${baseUrl}${path}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (authToken) headers.set('authorization', `Bearer ${authToken}`);
  else if (devUserId) headers.set('x-dev-user', devUserId);

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(response.status, body || response.statusText);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Authenticated raw upload with byte progress for the reserved media PUT route. */
export function uploadRequest<T>(
  path: string,
  file: Blob,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${baseUrl}${path}`);
    xhr.setRequestHeader('content-type', file.type);
    if (authToken) xhr.setRequestHeader('authorization', `Bearer ${authToken}`);
    else if (devUserId) xhr.setRequestHeader('x-dev-user', devUserId);
    xhr.upload.addEventListener('progress', (event) => {
      onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
    });
    xhr.addEventListener('load', () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new ApiError(xhr.status, xhr.responseText || xhr.statusText));
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        reject(new ApiError(xhr.status, 'Invalid API response'));
      }
    });
    xhr.addEventListener('error', () => reject(new ApiError(0, 'Upload failed')));
    xhr.addEventListener('abort', () => reject(new ApiError(0, 'Upload cancelled')));
    xhr.send(file);
  });
}
