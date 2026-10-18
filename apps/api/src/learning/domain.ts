import { z } from 'zod';
import { richTextDocumentSchema } from '@mukhtalif/validation';
import type { CourseDefinition, CourseEnrollment } from '@mukhtalif/types';
import { richTextToPlainText, renderRichText } from '../publishing/rich-text';

export class LearningError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 422 | 503,
    message: string,
  ) {
    super(message);
  }
}
export const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,140}$/);
const text = z.string().trim().max(20000);
const title = z.string().trim().min(1).max(200);
const file = z
  .string()
  .max(500)
  .refine((v) => !v || /^\/private\/files\/[a-zA-Z0-9_.-]+$/.test(v));
const resource = z.object({ id: identifier, title, file });
const assignment = z.object({
  id: identifier,
  title,
  instructions: text,
  required: z.boolean(),
  file,
});
const quiz = z.object({
  id: identifier,
  title,
  passPercent: z.number().min(1).max(100),
  maxAttempts: z.number().int().min(1).max(100),
  questions: z
    .array(
      z
        .object({
          id: identifier,
          prompt: title.max(3000),
          options: z.array(title.max(2000)).min(2).max(10),
          correct: z.number().int().min(0).max(9),
        })
        .refine((q) => q.correct < q.options.length),
    )
    .min(1)
    .max(50),
});
const document = richTextDocumentSchema.optional();
const lesson = z
  .object({
    id: identifier,
    title,
    body: text,
    bodyDocument: document,
    video: file,
    durationSeconds: z.number().min(0).max(86400),
    resources: z.array(resource).max(30),
    quiz: quiz.optional(),
    assignment: assignment.optional(),
  })
  .refine((l) => !l.video || l.durationSeconds > 0);
const schema = z.object({
  id: identifier,
  title,
  description: text,
  descriptionDocument: document,
  overview: text.optional(),
  overviewDocument: document,
  audience: text.max(3000).optional(),
  trailer: file.optional(),
  category: text.max(200),
  skill: text.max(200),
  level: text.max(200),
  instructor: text.max(200),
  price: z.number().min(0).max(100000),
  published: z.boolean(),
  lessons: z.array(lesson).max(200),
  resources: z.array(resource).max(30),
  quiz: quiz.optional(),
  assignment: assignment.optional(),
});
export function definition(input: unknown): CourseDefinition {
  const c = schema.parse(input);
  const ids = new Set<string>();
  const add = (id: string) => {
    if (ids.has(id)) throw new LearningError(422, 'معرّفات المحتوى مكررة.');
    ids.add(id);
  };
  for (const s of [c, ...c.lessons]) {
    if (s !== c) add(s.id);
    s.resources.forEach((r) => add(r.id));
    if (s.quiz) {
      add(s.quiz.id);
      s.quiz.questions.forEach((q) => add(q.id));
    }
    if (s.assignment) add(s.assignment.id);
  }
  if (c.published && !c.lessons.length) throw new LearningError(422, 'أضف درسًا قبل نشر الدورة.');
  if (c.trailer && !/\.(mp4|webm)$/i.test(c.trailer))
    throw new LearningError(422, 'ارفع فيديو MP4 أو WebM للمقطع التعريفي.');
  if (c.descriptionDocument) c.description = richTextToPlainText(c.descriptionDocument);
  if (c.overviewDocument) c.overview = richTextToPlainText(c.overviewDocument);
  for (const l of c.lessons) if (l.bodyDocument) l.body = richTextToPlainText(l.bodyDocument);
  return {
    ...c,
    lessonCount: c.lessons.length,
    durationMinutes: Math.ceil(c.lessons.reduce((n, l) => n + l.durationSeconds, 0) / 60),
  };
}
export function summary(c: CourseDefinition) {
  const { lessons: _l, resources: _r, quiz: _q, assignment: _a, trailer, ...rest } = c;
  void _l;
  void _r;
  void _q;
  void _a;
  return {
    ...rest,
    hasTrailer: !!trailer,
    descriptionHtml: c.descriptionDocument ? renderRichText(c.descriptionDocument) : undefined,
    overviewHtml: c.overviewDocument ? renderRichText(c.overviewDocument) : undefined,
  };
}
export function learnerCourse(c: CourseDefinition) {
  const result = structuredClone(c);
  for (const source of [result, ...result.lessons])
    for (const q of source.quiz?.questions ?? []) delete q.correct;
  return {
    ...result,
    ...summary(c),
    lessons: result.lessons.map((l) => ({
      ...l,
      bodyHtml: l.bodyDocument ? renderRichText(l.bodyDocument) : undefined,
    })),
  };
}
export function files(c: CourseDefinition) {
  return [
    ...new Set(
      [
        c.trailer ?? '',
        ...[c, ...c.lessons].flatMap((s) => [
          ...s.resources.map((r) => r.file),
          s.assignment?.file ?? '',
          'video' in s ? s.video : '',
        ]),
      ].filter(Boolean),
    ),
  ];
}
export type State = CourseEnrollment & {
  _ranges: Record<string, [number, number][]>;
  _reported: Record<string, number>;
};
export function publicState(s: State): CourseEnrollment {
  const { _ranges: _r, _reported: _p, ...rest } = s;
  void _r;
  void _p;
  return rest;
}
export function eligible(c: CourseDefinition, s: State) {
  return (
    c.lessons.length > 0 &&
    c.lessons.every((l) => s.progress[l.id]?.complete) &&
    [c, ...c.lessons].every(
      (x) =>
        (!x.quiz || s.quizzes[x.quiz.id]?.passed) &&
        (!x.assignment?.required || s.assignments[x.assignment.id]?.status === 'Pass'),
    )
  );
}
/** Enforce the lesson sequence when media is requested, not only when progress is saved. */
export function assertVideoAccess(c: CourseDefinition, s: State, file: string) {
  if (file === c.trailer) return;
  const owners = c.lessons.map((lesson, index) => ({ lesson, index })).filter(({ lesson }) => lesson.video === file);
  if (owners.length && !owners.some(({ index }) => c.lessons.slice(0, index).every((lesson) => s.progress[lesson.id]?.complete))) {
    throw new LearningError(403, 'أكمل الدروس السابقة لمشاهدة هذا الفيديو.');
  }
}

export function updateState(
  c: CourseDefinition,
  s: State,
  action: string,
  p: Record<string, unknown>,
  member: string,
  now = Date.now(),
) {
  const fail = (message: string): never => {
    throw new LearningError(422, message);
  };
  // UI locks are repeated here so direct API calls cannot skip the curriculum.
  if (action === 'progress' || action === 'bookmark') {
    const index = c.lessons.findIndex((l) => l.id === p.lessonId);
    if (index > 0 && c.lessons.slice(0, index).some((l) => !s.progress[l.id]?.complete))
      return fail('أكمل الدروس السابقة أولًا.');
  }
  if (action === 'quiz' || action === 'assignment') {
    const source = [c, ...c.lessons].find((x) =>
      action === 'quiz' ? x.quiz?.id === p.quizId : x.assignment?.id === p.assignmentId,
    );
    if (
      source &&
      (source === c
        ? c.lessons.some((l) => !s.progress[l.id]?.complete)
        : !s.progress[source.id]?.complete)
    )
      return fail('أكمل محتوى الدرس قبل بدء التقييم.');
  }
  if (action === 'progress') {
    const l = c.lessons.find((l) => l.id === p.lessonId);
    if (!l) return fail('الدرس غير موجود.');
    const position = z.number().min(0).max(l.durationSeconds).parse(p.position);
    const old = s.progress[l.id] ?? { position: 0, watched: 0, complete: false, readPercent: 0 };
    let ranges = s._ranges[l.id] ?? [];
    if (p.start !== undefined && p.end !== undefined) {
      const start = z.number().min(0).max(l.durationSeconds).parse(p.start),
        end = z.number().min(start).max(l.durationSeconds).parse(p.end);
      if (
        end - start >
        Math.min(32, Math.max(0, (now - (s._reported[l.id] ?? now)) / 1000) * 2.2 + 1)
      )
        return fail('تعذّر حفظ هذا المقطع. استأنف المشاهدة.');
      const merged: [number, number][] = [];
      for (const r of [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0])) {
        const last = merged.at(-1);
        if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
        else merged.push([...r]);
      }
      ranges = merged;
    }
    s._ranges[l.id] = ranges;
    s._reported[l.id] = now;
    const watched = ranges.reduce((n, r) => n + r[1] - r[0], 0),
      readPercent = l.video
        ? 0
        : Math.max(
            old.readPercent ?? 0,
            z
              .number()
              .min(0)
              .max(100)
              .parse(p.readPercent ?? 0),
          );
    s.progress[l.id] = {
      position,
      watched,
      readPercent,
      complete:
        old.complete ||
        (l.video ? watched >= l.durationSeconds * 0.9 : readPercent >= 100 || p.read === true),
    };
    s.lastLesson = l.id;
  } else if (action === 'quiz') {
    const q = [c, ...c.lessons].map((x) => x.quiz).find((q) => q?.id === p.quizId);
    if (!q) return fail('الاختبار غير موجود.');
    const old = s.quizzes[q.id] ?? { attempts: 0, passed: false, percentage: 0 };
    if (old.attempts >= q.maxAttempts) return fail('استهلكت جميع المحاولات.');
    const answers = z.record(z.number().int()).parse(p.answers);
    if (
      Object.keys(answers).length !== q.questions.length ||
      q.questions.some(
        (x) =>
          answers[x.id] === undefined || answers[x.id] < 0 || answers[x.id] >= x.options.length,
      )
    )
      return fail('أجب عن جميع الأسئلة.');
    const percentage =
      (100 * q.questions.filter((x) => answers[x.id] === x.correct).length) / q.questions.length;
    s.quizzes[q.id] = {
      attempts: old.attempts + 1,
      percentage,
      passed: old.passed || percentage >= q.passPercent,
    };
  } else if (action === 'assignment') {
    const a = [c, ...c.lessons].map((x) => x.assignment).find((a) => a?.id === p.assignmentId);
    if (!a) return fail('ورقة العمل غير موجودة.');
    const old = s.assignments[a.id];
    if (old?.status === 'Pass') return fail('اجتزت ورقة العمل بالفعل.');
    s.assignments[a.id] = {
      id: old?.id ?? crypto.randomUUID(),
      status: 'Not Graded',
      comments: '',
      answer: z.string().trim().min(1).max(20000).parse(p.answer),
    };
  } else if (action === 'bookmark') {
    const lesson = c.lessons.find((item) => item.id === p.lessonId);
    if (!lesson?.video) return fail('علامات الوقت متاحة لدروس الفيديو فقط.');
    const id = z.string().uuid().parse(p.id);
    const position = z.number().finite().min(0).max(lesson.durationSeconds).parse(p.position);
    const note = z.string().trim().max(2000).parse(p.note);
    s.bookmarks ??= {};
    if (s.bookmarks[id] && s.bookmarks[id].lessonId !== lesson.id) return fail('العلامة تخص درسًا آخر.');
    if (p.remove === true) delete s.bookmarks[id];
    else {
      if (!s.bookmarks[id] && Object.keys(s.bookmarks).length >= 500) return fail('وصلت إلى الحد الأقصى للعلامات في هذه الدورة.');
      s.bookmarks[id] = { lessonId: lesson.id, position, note };
    }
  } else if (action === 'certificate') {
    if (!eligible(c, s)) return fail('أكمل الدروس واجتز الاختبارات وأوراق العمل المطلوبة أولًا.');
    s.certificate ??= { id: crypto.randomUUID(), issuedAt: new Date(now).toISOString(), member };
  } else throw new LearningError(404, 'الطلب غير متاح.');
  return s;
}
