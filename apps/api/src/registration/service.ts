import { createClient } from '@supabase/supabase-js';
import type { RegistrationForm } from '@mukhtalif/types';
import {
  registrationFormSchema,
  registrationSubmissionSchema,
  validateRegistrationAnswers,
} from '@mukhtalif/validation';
import { getSupabaseCredentials, type Env } from '../env';
export class RegistrationError extends Error {
  constructor(
    readonly status: 404 | 409 | 422 | 503,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}
function check(error: { message: string } | null) {
  if (!error) return;
  if (error.message.includes('registration_conflict'))
    throw new RegistrationError(409, 'تغيّر النموذج. حدّث الصفحة وحاول مجددًا.');
  if (error.message.includes('registration_closed'))
    throw new RegistrationError(409, 'التسجيل مغلق حاليًا.');
  throw new RegistrationError(503, 'تعذّر الوصول إلى النماذج. حاول مجددًا.');
}
export async function registrationRequest(
  env: Env,
  action: 'list' | 'save' | 'public' | 'submit' | 'responses',
  input: unknown,
) {
  const credentials = getSupabaseCredentials(env);
  if (!credentials) throw new RegistrationError(503, 'خدمة النماذج غير مهيأة.');
  const db = createClient(credentials.url, credentials.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const p = input as { id: string; page?: number; query?: string; before?: string; body?: unknown };
  if (action === 'list') {
    const r = await db
      .from('registration_forms')
      .select('definition')
      .order('updated_at', { ascending: false });
    check(r.error);
    return (r.data ?? []).map((r) => r.definition as RegistrationForm);
  }
  if (action === 'save') {
    const definition = registrationFormSchema.parse(input);
    const r = await db.rpc('registration_save', { p_definition: definition });
    check(r.error);
    return r.data;
  }
  const row = await db.from('registration_forms').select('definition').eq('id', p.id).maybeSingle();
  check(row.error);
  const form = row.data?.definition as RegistrationForm | undefined;
  if (!form || ((action === 'public' || action === 'submit') && form.status === 'draft'))
    throw new RegistrationError(404, 'النموذج غير متاح.');
  if (action === 'public') return form;
  if (action === 'submit') {
    const body = registrationSubmissionSchema.parse(p.body);
    if (body.revision !== form.revision)
      throw new RegistrationError(409, 'تغيّر النموذج. حدّث الصفحة وحاول مجددًا.');
    const result = validateRegistrationAnswers(form.fields, body.answers);
    if (Object.keys(result.errors).length)
      throw new RegistrationError(422, 'راجع الإجابات المحددة.', result.errors);
    const r = await db.rpc('registration_submit', {
      p_form: p.id,
      p_revision: body.revision,
      p_request: body.requestId,
      p_answers: result.answers,
    });
    check(r.error);
    return { accepted: true };
  }
  const page = p.page ?? 1;
  let query = db
    .from('registration_responses')
    .select('id,form_id,answers,fields,created_at', { count: 'exact' })
    .eq('form_id', p.id);
  if (p.query) query = query.ilike('search_text', `%${p.query.replace(/[\\%_]/g, '\\$&')}%`);
  if (p.before) query = query.lte('created_at', p.before);
  const r = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range((page - 1) * 100, page * 100 - 1);
  check(r.error);
  return { items: r.data ?? [], total: r.count ?? 0, page };
}
