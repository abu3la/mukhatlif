import { URL } from 'node:url';
import { beforeAll, afterAll, describe, it, expect, vi, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { registrationFormSchema, validateRegistrationAnswers } from '@mukhtalif/validation';
import type { RegistrationForm } from '@mukhtalif/types';
import app from '../index';
import { registrationRequest } from './service';
import type * as Service from './service';
vi.mock('./service', async (original) => ({
  ...(await original<typeof Service>()),
  registrationRequest: vi.fn(),
}));
const id = '00000000-0000-4000-8000-000000000010',
  field = '00000000-0000-4000-8000-000000000011';
const form: RegistrationForm = {
  id,
  title: 'ورشة',
  description: '',
  successMessage: 'وصل الطلب',
  status: 'published',
  revision: 0,
  fields: [{ id: field, label: 'البريد', type: 'email', required: true, help: '', options: [] }],
};
const db = new PGlite();
beforeAll(async () => {
  await db.exec(
    'create role anon;create role authenticated;create role service_role bypassrls;create table public.schema_migrations(filename text primary key);',
  );
  await db.exec(
    readFileSync(
      new URL('../../supabase/migrations/0026_registration_forms.sql', import.meta.url),
      'utf8',
    ),
  );
}, 30000);
afterAll(() => db.close());
beforeEach(() => vi.mocked(registrationRequest).mockReset());
describe('registration validation', () => {
  it('validates definitions and avoids duplicate field identifiers', () => {
    expect(registrationFormSchema.safeParse(form).success).toBe(true);
    expect(
      registrationFormSchema.safeParse({ ...form, fields: [...form.fields, ...form.fields] })
        .success,
    ).toBe(false);
    expect(
      registrationFormSchema.safeParse({
        ...form,
        fields: [{ ...form.fields[0], type: 'select', options: ['same', 'same'] }],
      }).success,
    ).toBe(false);
  });
  it('rejects missing required answers, wrong types, unknown fields and forged choices', () => {
    expect(validateRegistrationAnswers(form.fields, {}).errors[field]).toBeTruthy();
    expect(
      validateRegistrationAnswers(form.fields, { [field]: 'not-email' }).errors[field],
    ).toBeTruthy();
    expect(validateRegistrationAnswers(form.fields, { [field]: true }).errors[field]).toBeTruthy();
    expect(
      validateRegistrationAnswers(form.fields, { unknown: 'value' }).errors._form,
    ).toBeTruthy();
    expect(
      validateRegistrationAnswers([{ ...form.fields[0], type: 'select', options: ['A'] }], {
        [field]: 'B',
      }).errors[field],
    ).toBeTruthy();
    expect(
      validateRegistrationAnswers([{ ...form.fields[0], type: 'multiselect', options: ['A'] }], {
        [field]: ['A', 'A'],
      }).errors[field],
    ).toBeTruthy();
  });
  it('normalizes email and Arabic phone digits and enforces confirmations', () => {
    expect(
      validateRegistrationAnswers(form.fields, { [field]: 'USER@example.com' }).answers[field],
    ).toBe('user@example.com');
    expect(
      validateRegistrationAnswers([{ ...form.fields[0], type: 'phone' }], { [field]: '٠٥٠١٢٣٤٥٦٧' })
        .answers[field],
    ).toBe('0501234567');
    expect(
      validateRegistrationAnswers([{ ...form.fields[0], type: 'checkbox' }], { [field]: false })
        .errors[field],
    ).toBeTruthy();
  });
});
describe('real PostgreSQL migration', () => {
  it('keeps response tables and RPCs inaccessible to browser roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['registration_forms', 'registration_responses'])
        expect(
          (
            await db.query<{ ok: boolean }>(
              "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as ok",
              [role, table],
            )
          ).rows[0].ok,
        ).toBe(false);
      expect(
        (
          await db.query<{ ok: boolean }>(
            "select has_function_privilege($1,'registration_submit(uuid,integer,uuid,jsonb)','EXECUTE') as ok",
            [role],
          )
        ).rows[0].ok,
      ).toBe(false);
    }
  });
  it('serializes edits, submission revisions, retries, and preserves historical labels', async () => {
    await db.query('select registration_save($1::jsonb)', [JSON.stringify(form)]);
    await expect(
      db.query('select registration_save($1::jsonb)', [JSON.stringify(form)]),
    ).rejects.toThrow('registration_conflict');
    const submit = () =>
      db.query('select registration_submit($1,1,$2,$3)', [
        id,
        '00000000-0000-4000-8000-000000000012',
        JSON.stringify({ [field]: 'first@example.com' }),
      ]);
    await submit();
    await submit();
    expect((await db.query('select * from registration_responses')).rows).toHaveLength(1);
    await db.query('select registration_save($1::jsonb)', [
      JSON.stringify({
        ...form,
        revision: 1,
        fields: [{ ...form.fields[0], label: 'عنوان جديد' }],
      }),
    ]);
    expect(
      (
        await db.query<{ fields: RegistrationForm['fields'] }>(
          'select fields from registration_responses',
        )
      ).rows[0].fields[0].label,
    ).toBe('البريد');
    await expect(
      db.query('select registration_submit($1,1,$2,$3)', [
        id,
        '00000000-0000-4000-8000-000000000013',
        '{}',
      ]),
    ).rejects.toThrow('registration_conflict');
    await db.query('select registration_save($1::jsonb)', [
      JSON.stringify({ ...form, revision: 2, status: 'closed' }),
    ]);
    await expect(
      db.query('select registration_submit($1,3,$2,$3)', [
        id,
        '00000000-0000-4000-8000-000000000014',
        '{}',
      ]),
    ).rejects.toThrow('registration_closed');
  });
});
describe('route trust boundary', () => {
  const env = { APP_ENV: 'development', ALLOW_DEV_AUTH: 'true' };
  it('blocks unauthenticated and customer access to registrations', async () => {
    expect((await app.request('/studio/registration', {}, env)).status).toBe(401);
    expect(
      (
        await app.request(
          '/studio/registration',
          { headers: { 'x-dev-user': 'usr-listener-1' } },
          env,
        )
      ).status,
    ).toBe(403);
    expect(registrationRequest).not.toHaveBeenCalled();
  });
  it('does not expose answers through public reads and rejects malformed payloads', async () => {
    vi.mocked(registrationRequest).mockResolvedValue(form);
    expect((await app.request(`/registration/${id}`, {}, env)).status).toBe(200);
    expect(registrationRequest).toHaveBeenCalledWith(expect.anything(), 'public', { id });
    expect((await app.request(`/registration/${id}/responses`, {}, env)).status).toBe(404);
    const r = await app.request(
      `/registration/${id}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: {} }),
      },
      env,
    );
    expect(r.status).toBe(422);
  });
});
