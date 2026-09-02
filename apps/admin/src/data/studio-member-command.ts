import { inviteStudioMemberSchema } from '@mukhtalif/validation';
import type { CreateStudioMemberCommand } from './admin-repository';
import { AdminRepositoryError } from './repository-error';

export interface NormalizedCreateStudioMemberCommand {
  readonly name: string;
  readonly email: string;
  readonly role: CreateStudioMemberCommand['role'];
  readonly locale: CreateStudioMemberCommand['locale'];
}

function validationError(field: string, message: string): AdminRepositoryError {
  return new AdminRepositoryError({
    code: 'VALIDATION',
    operation: 'createStudioMember',
    message,
    retryable: false,
    context: { field },
  });
}

/** Normalizes the Studio-member invitation before either adapter processes it. */
export function normalizeCreateStudioMemberCommand(
  command: CreateStudioMemberCommand,
): NormalizedCreateStudioMemberCommand {
  if (!command || typeof command !== 'object') {
    throw validationError('command', 'A Studio-member creation command is required.');
  }

  const result = inviteStudioMemberSchema.safeParse({
    displayName: command.name,
    email: command.email,
    role: command.role,
    locale: command.locale,
  });
  if (!result.success) {
    const field = result.error.issues[0]?.path[0];
    const normalizedField =
      field === 'displayName' ? 'name' : String(field ?? 'command');
    throw validationError(
      normalizedField,
      'The Studio-member creation command is invalid.',
    );
  }
  if (result.data.role === 'listener') {
    throw validationError(
      'role',
      'Application-listener roles cannot be assigned in Studio.',
    );
  }

  return {
    name: result.data.displayName,
    email: result.data.email,
    role: result.data.role,
    locale: result.data.locale,
  };
}
