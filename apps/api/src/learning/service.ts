import { createClient } from '@supabase/supabase-js';
import type { CourseDefinition } from '@mukhtalif/types';
import type { Env } from '../env';
import {
  definition,
  summary,
  learnerCourse,
  files,
  publicState,
  updateState,
  assertVideoAccess,
  LearningError,
  type State,
} from './domain';
export { LearningError } from './domain';
export type Actor = { id: string; name: string; admin: boolean };
export function learningDb(env: Env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)
    throw new LearningError(503, 'الدورات غير متاحة الآن.');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export function checkDb(error: { message: string } | null) {
  if (error) {
    if (error.message.includes('learning_curriculum_locked'))
      throw new LearningError(
        409,
        'للدورة مشتركون. أنشئ نسخة جديدة لتعديل المحتوى أو شروط الإكمال.',
      );
    throw new LearningError(503, 'تعذّر حفظ بيانات الدورة. حاول مجددًا.');
  }
}
export async function learningRequest(
  env: Env,
  action: string,
  input: unknown,
  actor?: Actor,
  origin = '',
): Promise<unknown> {
  const db = learningDb(env),
    p = input as Record<string, unknown>;
  if (action.startsWith('studio.') && !actor?.admin)
    throw new LearningError(403, 'إدارة الدورات متاحة للمدير فقط.');
  if (action === 'catalog' || action === 'studio.catalog') {
    const { data, error } = await db
      .from('learning_courses')
      .select('definition')
      .order('updated_at', { ascending: false });
    checkDb(error);
    return (data ?? [])
      .map((r) => r.definition as CourseDefinition)
      .filter((c) => action.startsWith('studio.') || c.published)
      .map(summary);
  }
  if (action === 'studio.save') {
    const c = definition(input);
    const owned = await db
      .from('learning_assets')
      .select('id')
      .eq('course_id', c.id)
      .eq('ready', true);
    checkDb(owned.error);
    if (files(c).some((f) => !owned.data?.some((a) => `/private/files/${a.id}` === f)))
      throw new LearningError(422, 'ارفع الملف لهذه الدورة أولًا.');
    const { data, error } = await db.rpc('learning_save_course', { p_definition: c });
    checkDb(error);
    return data;
  }
  if (action === 'library') {
    if (!actor) throw new LearningError(403, 'سجّل الدخول أولًا.');
    const { data, error } = await db
      .from('learning_enrollments')
      .select('state,learning_courses(definition)')
      .eq('user_id', actor.id);
    checkDb(error);
    return (data ?? []).map((r) => ({
      course: summary(
        (r.learning_courses as unknown as { definition: CourseDefinition }).definition,
      ),
      enrollment: publicState(r.state),
    }));
  }
  const row = await db
    .from('learning_courses')
    .select('definition')
    .eq('id', p.courseId)
    .maybeSingle();
  checkDb(row.error);
  const c = row.data?.definition as CourseDefinition | undefined;
  if (!c || (!action.startsWith('studio.') && !c.published))
    throw new LearningError(404, 'الدورة غير متاحة.');
  if (action === 'detail')
    return {
      ...summary(c),
      lessons: c.lessons.map(({ id, title, durationSeconds }) => ({ id, title, durationSeconds })),
    };
  if (action === 'studio.detail') return c;
  if (action.startsWith('studio.upload-')) {
    const { upload } = await import('./uploads');
    return upload(env, c.id, action, p, actor!);
  }
  if (action === 'trailer') {
    if (!c.trailer) throw new LearningError(404, 'لا يوجد مقطع تعريفي لهذه الدورة.');
    const { assetLink } = await import('./media');
    return assetLink(env, origin, c, c.trailer);
  }
  if (action === 'studio.learners') {
    const { data, error } = await db
      .from('learning_enrollments')
      .select('user_id,member_name,state')
      .eq('course_id', c.id);
    checkDb(error);
    return (data ?? []).map((r) => ({
      member: r.user_id,
      name: r.member_name,
      enrollment: publicState(r.state),
      submissions: Object.entries((r.state as State).assignments).map(([id, a]) => ({
        name: a.id,
        assignment_title:
          [c, ...c.lessons].find((x) => x.assignment?.id === id)?.assignment?.title ?? '',
        answer: a.answer ?? '',
        status: a.status,
        comments: a.comments,
      })),
    }));
  }
  if (!actor) throw new LearningError(403, 'سجّل الدخول أولًا.');
  if (action === 'checkout') {
    if (env.LEARNING_SIMULATION_ENABLED !== 'true' || p.mode !== 'simulation')
      throw new LearningError(403, 'التسجيل التجريبي غير متاح الآن.');
    if (p.outcome !== 'success')
      throw new LearningError(409, 'رُفض الدفع التجريبي. لم يُخصم أي مبلغ ولم تُفتح الدورة.');
    const state: State = {
      courseId: c.id,
      lastLesson: null,
      progress: {},
      quizzes: {},
      assignments: {},
      certificate: null,
      order: {
        id: crypto.randomUUID(),
        amount: c.price,
        mode: 'simulation',
        createdAt: new Date().toISOString(),
      },
      _ranges: {},
      _reported: {},
    };
    const { data, error } = await db.rpc('learning_enroll', {
      p_course: c.id,
      p_user: actor.id,
      p_name: actor.name,
      p_state: state,
    });
    checkDb(error);
    return publicState(data);
  }
  let member = actor.id;
  if (action === 'studio.grade') {
    const rows = await db
      .from('learning_enrollments')
      .select('user_id,state')
      .eq('course_id', c.id);
    checkDb(rows.error);
    const found = rows.data?.find((r) =>
      Object.values((r.state as State).assignments).some((a) => a.id === p.submissionId),
    );
    if (!found) throw new LearningError(404, 'التسليم غير موجود.');
    member = found.user_id;
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await db
      .from('learning_enrollments')
      .select('state,revision,member_name')
      .eq('course_id', c.id)
      .eq('user_id', member)
      .maybeSingle();
    checkDb(r.error);
    if (!r.data) throw new LearningError(403, 'سجّل في الدورة للوصول إلى محتواها.');
    const state = r.data.state as State;
    if (action === 'workspace') return { course: learnerCourse(c), enrollment: publicState(state) };
    if (action === 'asset') {
      assertVideoAccess(c, state, String(p.file));
      const { assetLink } = await import('./media');
      return assetLink(env, origin, c, String(p.file), actor.id);
    }
    if (action === 'studio.grade') {
      const a = Object.values(state.assignments).find((a) => a.id === p.submissionId);
      if (!a) throw new LearningError(404, 'التسليم غير موجود.');
      a.status = String(p.status);
      a.comments = String(p.comments);
    } else updateState(c, state, action, p, r.data.member_name);
    // Compare-and-set retries reapply the operation to the latest state. No lost progress or extra attempts.
    const saved = await db
      .from('learning_enrollments')
      .update({ state, revision: r.data.revision + 1, updated_at: new Date().toISOString() })
      .eq('course_id', c.id)
      .eq('user_id', member)
      .eq('revision', r.data.revision)
      .select('revision');
    checkDb(saved.error);
    if (saved.data?.length) return publicState(state);
  }
  throw new LearningError(409, 'تغيّر تقدمك من جهاز آخر. حاول مجددًا.');
}
