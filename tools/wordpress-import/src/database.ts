export type RestValue = string | number | boolean | null;

export interface RestDatabase {
  select(
    table: string,
    columns?: string,
    filters?: Readonly<Record<string, RestValue>>,
  ): Promise<Array<Record<string, unknown>>>;
  insert(table: string, rows: ReadonlyArray<Record<string, unknown>>): Promise<void>;
  update(
    table: string,
    values: Record<string, unknown>,
    filters: Readonly<Record<string, RestValue>>,
  ): Promise<void>;
}

interface SupabaseRestDatabaseOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImplementation?: typeof fetch;
  pageSize?: number;
}

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
const MAX_ERROR_BODY = 2_000;

function requireIdentifier(value: string, label: string): string {
  if (!IDENTIFIER.test(value)) throw new Error(`Invalid ${label}: ${value}`);
  return value;
}

function normalizedOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/') {
    throw new Error('SUPABASE_URL must be an HTTPS origin without credentials or a path');
  }
  return url.origin;
}

function looksLikeLegacyJwt(value: string): boolean {
  return value.split('.').length === 3;
}

function assertServiceRoleKey(value: string): void {
  if (value.startsWith('sb_secret_') && value.length >= 32) return;
  if (!looksLikeLegacyJwt(value)) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not a service-role or secret API key');
  }
  try {
    const payload = value.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: unknown;
    };
    if (decoded.role !== 'service_role') {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY JWT does not carry the service_role claim');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('service_role')) throw error;
    throw new Error('SUPABASE_SERVICE_ROLE_KEY JWT payload is invalid');
  }
}

function filterExpression(value: RestValue): string {
  if (value === null) return 'is.null';
  return `eq.${String(value)}`;
}

function safeErrorBody(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').slice(0, MAX_ERROR_BODY);
}

export class SupabaseRestDatabase implements RestDatabase {
  readonly #origin: string;
  readonly #serviceRoleKey: string;
  readonly #fetch: typeof fetch;
  readonly #pageSize: number;

  constructor(options: SupabaseRestDatabaseOptions) {
    this.#origin = normalizedOrigin(options.supabaseUrl);
    assertServiceRoleKey(options.serviceRoleKey);
    this.#serviceRoleKey = options.serviceRoleKey;
    this.#fetch = options.fetchImplementation ?? fetch;
    this.#pageSize = options.pageSize ?? 500;
    if (!Number.isInteger(this.#pageSize) || this.#pageSize < 1 || this.#pageSize > 1_000) {
      throw new Error('Supabase REST page size must be an integer from 1 to 1000');
    }
  }

  #headers(prefer?: string): Headers {
    const headers = new Headers({
      Accept: 'application/json',
      apikey: this.#serviceRoleKey,
    });
    // Legacy service-role keys are JWTs. New sb_secret keys authenticate through
    // the apikey header and must not be presented as bearer tokens.
    if (looksLikeLegacyJwt(this.#serviceRoleKey)) {
      headers.set('Authorization', `Bearer ${this.#serviceRoleKey}`);
    }
    if (prefer) headers.set('Prefer', prefer);
    return headers;
  }

  #url(table: string, columns = '*', filters: Readonly<Record<string, RestValue>> = {}): URL {
    const safeTable = requireIdentifier(table, 'table name');
    const url = new URL(`/rest/v1/${safeTable}`, this.#origin);
    url.searchParams.set('select', columns);
    for (const [column, value] of Object.entries(filters)) {
      url.searchParams.set(requireIdentifier(column, 'filter column'), filterExpression(value));
    }
    return url;
  }

  async #assertResponse(response: Response, operation: string): Promise<void> {
    if (response.ok) return;
    const body = safeErrorBody(await response.text());
    throw new Error(`${operation} failed with HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }

  async select(
    table: string,
    columns = '*',
    filters: Readonly<Record<string, RestValue>> = {},
  ): Promise<Array<Record<string, unknown>>> {
    const result: Array<Record<string, unknown>> = [];
    for (let offset = 0; ; offset += this.#pageSize) {
      const headers = this.#headers();
      headers.set('Range', `${offset}-${offset + this.#pageSize - 1}`);
      headers.set('Range-Unit', 'items');
      const response = await this.#fetch(this.#url(table, columns, filters), {
        method: 'GET',
        headers,
      });
      await this.#assertResponse(response, `Select from ${table}`);
      const page = (await response.json()) as unknown;
      if (!Array.isArray(page)) throw new Error(`Select from ${table} did not return an array`);
      result.push(...(page as Array<Record<string, unknown>>));
      if (page.length < this.#pageSize) return result;
    }
  }

  async insert(table: string, rows: ReadonlyArray<Record<string, unknown>>): Promise<void> {
    if (!rows.length) return;
    requireIdentifier(table, 'table name');
    const chunkSize = 100;
    for (let offset = 0; offset < rows.length; offset += chunkSize) {
      const chunk = rows.slice(offset, offset + chunkSize);
      const headers = this.#headers('return=minimal');
      headers.set('Content-Type', 'application/json');
      const response = await this.#fetch(this.#url(table), {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      await this.#assertResponse(response, `Insert into ${table}`);
    }
  }

  async update(
    table: string,
    values: Record<string, unknown>,
    filters: Readonly<Record<string, RestValue>>,
  ): Promise<void> {
    if (!Object.keys(filters).length) throw new Error(`Refusing an unfiltered update of ${table}`);
    if (!Object.keys(values).length) return;
    const headers = this.#headers('return=minimal');
    headers.set('Content-Type', 'application/json');
    const response = await this.#fetch(this.#url(table, '*', filters), {
      method: 'PATCH',
      headers,
      body: JSON.stringify(values),
    });
    await this.#assertResponse(response, `Update ${table}`);
  }
}

export function supabaseProjectRef(supabaseUrl: string): string {
  const url = new URL(normalizedOrigin(supabaseUrl));
  const suffix = '.supabase.co';
  if (!url.hostname.endsWith(suffix)) {
    throw new Error('SUPABASE_URL must use the canonical <project-ref>.supabase.co hostname');
  }
  const projectRef = url.hostname.slice(0, -suffix.length);
  if (!/^[a-z0-9]{8,40}$/.test(projectRef)) {
    throw new Error('Could not derive a valid project ref from SUPABASE_URL');
  }
  return projectRef;
}
