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
  headers.set('content-type', 'application/json');
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
