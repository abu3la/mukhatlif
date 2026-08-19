import { describe, expect, it } from 'vitest';
import type { CreateStudioMemberCommand } from './admin-repository';
import { normalizeCreateStudioMemberCommand } from './studio-member-command';

function command(
  overrides: Partial<CreateStudioMemberCommand> = {},
): CreateStudioMemberCommand {
  return {
    name: 'ليان',
    email: 'lian@example.com',
    role: 'editor',
    locale: 'ar',
    ...overrides,
  };
}

describe('normalizeCreateStudioMemberCommand', () => {
  it.each([
    ['أ', 'minimum name length'],
    ['أ'.repeat(101), 'maximum name length'],
  ])('rejects a name outside the server boundary: %s (%s)', (name) => {
    expect(() => normalizeCreateStudioMemberCommand(command({ name }))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION', context: { field: 'name' } }),
    );
  });

  it('accepts names at the 2 and 100 character boundaries', () => {
    expect(normalizeCreateStudioMemberCommand(command({ name: 'أب' })).name).toBe('أب');
    expect(
      normalizeCreateStudioMemberCommand(command({ name: 'أ'.repeat(100) })).name,
    ).toHaveLength(100);
  });

  it('accepts 254 email characters and rejects 255', () => {
    const localPart = 'a'.repeat(64);
    const domainAt254 = `${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(57)}.com`;
    const emailAt254 = `${localPart}@${domainAt254}`;
    const emailAt255 = `${localPart}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(58)}.com`;

    expect(emailAt254).toHaveLength(254);
    expect(emailAt255).toHaveLength(255);
    expect(normalizeCreateStudioMemberCommand(command({ email: emailAt254 })).email).toBe(
      emailAt254,
    );
    expect(() => normalizeCreateStudioMemberCommand(command({ email: emailAt255 }))).toThrowError(
      expect.objectContaining({ code: 'VALIDATION', context: { field: 'email' } }),
    );
  });

  it.each(['a@b..com', '.a@example.com'])(
    'rejects an email that the shared server contract rejects: %s',
    (email) => {
      expect(() => normalizeCreateStudioMemberCommand(command({ email }))).toThrowError(
        expect.objectContaining({ code: 'VALIDATION', context: { field: 'email' } }),
      );
    },
  );
});
