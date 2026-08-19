export const ADMIN_REPOSITORY_ERROR_CODES = [
  'CONFIGURATION',
  'UNSUPPORTED_CAPABILITY',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION',
  'RATE_LIMITED',
  'NETWORK',
  'REMOTE_UNAVAILABLE',
  'REMOTE_ERROR',
  'INVALID_RESPONSE',
] as const;

export type AdminRepositoryErrorCode = (typeof ADMIN_REPOSITORY_ERROR_CODES)[number];

export interface AdminRepositoryErrorDetails {
  readonly code: AdminRepositoryErrorCode;
  readonly operation: string;
  readonly message: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly context?: Readonly<Record<string, unknown>>;
}

/**
 * The only error shape allowed to cross the admin data boundary.
 * UI code can branch on `code` without parsing server messages.
 */
export class AdminRepositoryError extends Error {
  readonly code: AdminRepositoryErrorCode;
  readonly operation: string;
  readonly status?: number;
  readonly retryable: boolean;
  readonly context?: Readonly<Record<string, unknown>>;

  constructor(details: AdminRepositoryErrorDetails, options?: ErrorOptions) {
    super(details.message, options);
    this.name = 'AdminRepositoryError';
    this.code = details.code;
    this.operation = details.operation;
    this.status = details.status;
    this.retryable = details.retryable;
    this.context = details.context;
  }

  toJSON(): AdminRepositoryErrorDetails {
    return {
      code: this.code,
      operation: this.operation,
      message: this.message,
      status: this.status,
      retryable: this.retryable,
      context: this.context,
    };
  }
}

export function isAdminRepositoryError(error: unknown): error is AdminRepositoryError {
  return error instanceof AdminRepositoryError;
}

export function unsupportedCapability(
  operation: string,
  capability: string,
): AdminRepositoryError {
  return new AdminRepositoryError({
    code: 'UNSUPPORTED_CAPABILITY',
    operation,
    message: `The configured admin repository does not support ${capability}.`,
    retryable: false,
    context: { capability },
  });
}
