import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CourseDefinition, CourseLesson } from '@mukhtalif/types';
import type { Env } from '../env';
import { requirementsChanged } from './domain';

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  rpc: vi.fn(),
}));

/** An in-memory stand-in for the Supabase query builder used by the learning service. */
function query(table: string) {
  const filters: [string, unknown][] = [];
  let mode: 'select' | 'update' | 'delete' = 'select';
  let values: Row = {};
  let head = false;
  let returning = false;
  const rows = () => (store.tables[table] ??= []);
  const matches = () => rows().filter((row) => filters.every(([k, v]) => row[k] === v));
  const run = () => {
    const hit = matches();
    if (mode === 'update') hit.forEach((row) => Object.assign(row, values));
    if (mode === 'delete') store.tables[table] = rows().filter((row) => !hit.includes(row));
    const data = hit.map((row) => structuredClone(row));
    return {
      data: mode !== 'select' && !returning ? null : head ? null : data,
      count: hit.length,
      error: null,
    };
  };
  const builder = {
    select: (_columns?: string, options?: { head?: boolean }) => {
      if (mode === 'select') head = Boolean(options?.head);
      else returning = true;
      return builder;
    },
    update: (patch: Row) => {
      mode = 'update';
      values = patch;
      return builder;
    },
    delete: () => {
      mode = 'delete';
      return builder;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return builder;
    },
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    then: (resolve: (value: ReturnType<typeof run>) => void) => resolve(run()),
  };
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: (table: string) => query(table), rpc: store.rpc }),
}));

const { learningRequest } = await import('./service');
const { deleteCourse } = await import('./delete-course');

const lesson = (id: string, extra: Partial<CourseLesson> = {}): CourseLesson => ({
  id,
  title: `درس ${id}`,
  body: '',
  video: '',
  durationSeconds: 0,
  resources: [],
  ...extra,
});
const quiz = {
  id: 'q1',
  title: 'اختبار',
  passPercent: 70,
  maxAttempts: 3,
  questions: [{ id: 'qq1', prompt: 'سؤال؟', options: ['نعم', 'لا'], correct: 0 }],
};
const course = (
  lessons: CourseLesson[],
  extra: Partial<CourseDefinition> = {},
): CourseDefinition => ({
  id: 'c1',
  title: 'ورشة',
  description: '',
  category: '',
  skill: '',
  level: 'مبتدئ',
  instructor: '',
  price: 0,
  durationMinutes: 0,
  lessonCount: lessons.length,
  published: true,
  lessons,
  resources: [],
  ...extra,
});

describe('which edits change a learner’s requirements', () => {
  const before = course([lesson('a', { quiz }), lesson('b')], { quiz });
  it('lets content change freely', () => {
    const after = course(
      [
        lesson('a', {
          title: 'عنوان جديد',
          body: 'نص',
          video: '/private/files/v.mp4',
          durationSeconds: 90,
          resources: [{ id: 'r', title: 'ملف', file: '/private/files/r.pdf' }],
          quiz: {
            ...quiz,
            title: 'اسم آخر',
            questions: [{ ...quiz.questions[0], prompt: 'صياغة أوضح؟' }],
          },
        }),
        lesson('b'),
      ],
      { quiz, title: 'اسم جديد', price: 50 },
    );
    expect(requirementsChanged(before, after)).toBe(false);
  });
  it('lets new lessons follow the existing ones', () => {
    expect(requirementsChanged(before, course([...before.lessons, lesson('c')], { quiz }))).toBe(
      false,
    );
  });
  it('blocks removing, reordering or inserting before existing lessons', () => {
    expect(requirementsChanged(before, course([before.lessons[0]], { quiz }))).toBe(true);
    expect(
      requirementsChanged(before, course([before.lessons[1], before.lessons[0]], { quiz })),
    ).toBe(true);
    expect(requirementsChanged(before, course([lesson('z'), ...before.lessons], { quiz }))).toBe(
      true,
    );
  });
  it('blocks changing how a quiz or assignment is passed', () => {
    const stricter = { ...quiz, passPercent: 90 };
    expect(
      requirementsChanged(before, course([lesson('a', { quiz: stricter }), lesson('b')], { quiz })),
    ).toBe(true);
    const answer = { ...quiz, questions: [{ ...quiz.questions[0], correct: 1 }] };
    expect(requirementsChanged(before, course(before.lessons, { quiz: answer }))).toBe(true);
    expect(requirementsChanged(before, course(before.lessons))).toBe(true);
    const assignment = { id: 'w', title: 'ورقة', instructions: '', required: false, file: '' };
    const withWork = course(before.lessons, { quiz, assignment });
    expect(
      requirementsChanged(
        withWork,
        course(before.lessons, { quiz, assignment: { ...assignment, required: true } }),
      ),
    ).toBe(true);
    expect(
      requirementsChanged(
        withWork,
        course(before.lessons, { quiz, assignment: { ...assignment, title: 'اسم جديد' } }),
      ),
    ).toBe(false);
  });
});

const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service' } as Env;
const admin = { id: 'admin-1', name: 'Studio', admin: true };
const save = (definition: CourseDefinition) =>
  learningRequest(env, 'studio.save', definition, admin);

beforeEach(() => {
  store.rpc.mockReset();
  store.rpc.mockResolvedValue({ data: null, error: { message: 'learning_curriculum_locked' } });
  const saved = course([lesson('a', { video: '/private/files/old.mp4', durationSeconds: 60 })]);
  store.tables = {
    learning_courses: [{ id: 'c1', definition: saved, revision: 4 }],
    learning_enrollments: [{ course_id: 'c1', user_id: 'learner-1' }],
    learning_assets: [
      { id: 'old.mp4', course_id: 'c1', ready: true, object_key: 'learning/c1/old.mp4' },
      { id: 'new.mp4', course_id: 'c1', ready: true, object_key: 'learning/c1/new.mp4' },
    ],
    learning_media_tickets: [{ id: 't1', course_id: 'c1' }],
  };
});

describe('saving a course that has learners', () => {
  it('saves a new video and title without touching the curriculum lock', async () => {
    const next = course([
      lesson('a', { title: 'الجزء الأول', video: '/private/files/new.mp4', durationSeconds: 75 }),
    ]);
    const result = (await save(next)) as CourseDefinition;
    expect(result.lessons[0].video).toBe('/private/files/new.mp4');
    expect(store.rpc).not.toHaveBeenCalled();
    expect(store.tables.learning_courses[0]).toMatchObject({ revision: 5 });
    expect((store.tables.learning_courses[0].definition as CourseDefinition).lessons[0].title).toBe(
      'الجزء الأول',
    );
  });

  it('still refuses to reorder lessons, with a message saying what can change', async () => {
    store.tables.learning_courses[0].definition = course([lesson('a'), lesson('b')]);
    const error = await save(course([lesson('b'), lesson('a')])).catch((e: Error) => e);
    expect(store.rpc).toHaveBeenCalledOnce();
    expect(error).toMatchObject({ status: 409 });
    expect((error as Error).message).toMatch(/الفيديو والنصوص والملفات/);
  });

  it('does not overwrite a save that landed in between', async () => {
    const stale = course([
      lesson('a', { title: 'تعديل', video: '/private/files/old.mp4', durationSeconds: 60 }),
    ]);
    const real = store.tables.learning_courses[0];
    // Another save bumps the revision after this one read it.
    let reads = 0;
    Object.defineProperty(real, 'revision', {
      configurable: true,
      get: () => (reads++ === 0 ? 4 : 5),
      set: () => undefined,
    });
    await expect(save(stale)).rejects.toMatchObject({ status: 409 });
  });
});

describe('deleting a course', () => {
  const bucket = () => ({
    delete: vi.fn(async (_key: string) => undefined),
    resumeMultipartUpload: vi.fn(() => ({ abort: vi.fn(async () => undefined) })),
  });

  it('refuses when the learner count the editor saw is out of date', async () => {
    const media = bucket();
    await expect(
      deleteCourse({ ...env, MEDIA: media as unknown as Env['MEDIA'] }, 'c1', 0),
    ).rejects.toMatchObject({ status: 409 });
    expect(media.delete).not.toHaveBeenCalled();
    expect(store.tables.learning_courses).toHaveLength(1);
  });

  it('removes files, unfinished uploads, enrollments, tickets and the course', async () => {
    store.tables.learning_assets.push({
      id: 'half.mp4',
      course_id: 'c1',
      ready: false,
      upload_id: 'u-1',
      object_key: 'learning/c1/half.mp4',
    });
    store.tables.learning_courses.push({ id: 'other', definition: course([]), revision: 1 });
    const media = bucket();
    expect(
      await deleteCourse({ ...env, MEDIA: media as unknown as Env['MEDIA'] }, 'c1', 1),
    ).toEqual({
      deleted: 'c1',
    });
    expect(media.delete.mock.calls.map(([key]) => key).sort()).toEqual([
      'learning/c1/new.mp4',
      'learning/c1/old.mp4',
    ]);
    expect(media.resumeMultipartUpload).toHaveBeenCalledWith('learning/c1/half.mp4', 'u-1');
    for (const table of ['learning_assets', 'learning_enrollments', 'learning_media_tickets'])
      expect(store.tables[table]).toHaveLength(0);
    expect(store.tables.learning_courses.map((row) => row.id)).toEqual(['other']);
  });
});
