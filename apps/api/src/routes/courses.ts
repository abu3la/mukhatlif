import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requireAdmin, requireAuth, type AppEnv } from '../auth';
import { learningRequest, LearningError } from '../learning/frappe';

export const publicCoursesRoute = new Hono<AppEnv>();
export const customerCoursesRoute = new Hono<AppEnv>();
export const studioCoursesRoute = new Hono<AppEnv>();
for (const route of [publicCoursesRoute, customerCoursesRoute, studioCoursesRoute]) {
  route.onError((error, c) =>
    error instanceof LearningError
      ? c.json({ error: error.message }, error.status)
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? c.json({ error: 'راجع البيانات وحاول مجددًا.' }, 422)
        : c.json({ error: 'تعذّر إكمال الطلب.' }, 500),
  );
  route.use(
    '*',
    bodyLimit({
      maxSize: 8 * 1024 * 1024,
      onError: (c) => c.json({ error: 'حجم الملف أكبر من المسموح.' }, 413),
    }),
  );
}
customerCoursesRoute.use('*', requireAuth, async (c, next) => {
  if (!c.get('authEmail')) return c.json({ error: 'أكّد بريدك الإلكتروني أولًا.' }, 403);
  return next();
});
studioCoursesRoute.use('*', requireAdmin);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,140}$/);
async function call(c: Context<AppEnv>, action: string, payload: unknown = {}) {
  const admin = action.startsWith('studio.');
  const actorId = c.get('authUserId');
  return c.json(
    await learningRequest(
      c.env,
      action,
      payload,
      actorId
        ? {
            id: actorId,
            name: admin ? 'Studio' : (c.get('user')?.displayName ?? 'متعلم'),
            admin,
          }
        : undefined,
    ),
  );
}
publicCoursesRoute.get('/', (c) => call(c, 'catalog'));
publicCoursesRoute.get('/:id', (c) => call(c, 'detail', { courseId: id.parse(c.req.param('id')) }));
customerCoursesRoute.get('/', (c) => call(c, 'library'));
customerCoursesRoute.get('/:id', (c) =>
  call(c, 'workspace', { courseId: id.parse(c.req.param('id')) }),
);
customerCoursesRoute.post('/:id/checkout', async (c) => {
  if (c.env.LEARNING_SIMULATION_ENABLED !== 'true')
    return c.json({ error: 'التسجيل التجريبي غير متاح الآن.' }, 403);
  const input = z
    .object({ mode: z.literal('simulation'), outcome: z.enum(['success', 'declined']) })
    .strict()
    .safeParse(await c.req.json());
  if (!input.success) return c.json({ error: 'راجع بيانات التسجيل.' }, 422);
  return call(c, 'checkout', { ...input.data, courseId: id.parse(c.req.param('id')) });
});
const requests = {
  progress: z
    .object({
      lessonId: id,
      position: z.number().finite().min(0).max(86400),
      start: z.number().finite().min(0).max(86400).optional(),
      end: z.number().finite().min(0).max(86400).optional(),
      read: z.boolean().optional(),
    })
    .strict(),
  quiz: z.object({ quizId: id, answers: z.record(z.number().int().min(0).max(9)) }).strict(),
  assignment: z.object({ assignmentId: id, answer: z.string().min(1).max(20000) }).strict(),
  certificate: z.object({}).strict(),
  asset: z.object({ file: z.string().startsWith('/private/files/').max(500) }).strict(),
};
for (const [action, schema] of Object.entries(requests))
  customerCoursesRoute.post(`/:id/${action}`, async (c) => {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'راجع البيانات وحاول مجددًا.' }, 422);
    return call(c, action, { ...parsed.data, courseId: id.parse(c.req.param('id')) });
  });
studioCoursesRoute.get('/', (c) => call(c, 'studio.catalog'));
studioCoursesRoute.get('/:id', (c) =>
  call(c, 'studio.detail', { courseId: id.parse(c.req.param('id')) }),
);
studioCoursesRoute.get('/:id/learners', (c) =>
  call(c, 'studio.learners', { courseId: id.parse(c.req.param('id')) }),
);
studioCoursesRoute.post('/', async (c) => call(c, 'studio.save', await c.req.json()));
studioCoursesRoute.post('/:id/grade', async (c) => {
  const parsed = z
    .object({ submissionId: id, status: z.enum(['Pass', 'Fail']), comments: z.string().max(10000) })
    .strict()
    .safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: 'راجع التقييم.' }, 422);
  return call(c, 'studio.grade', { ...parsed.data, courseId: id.parse(c.req.param('id')) });
});
const uploads = {
  'upload-start': z
    .object({
      filename: z.string().regex(/^[a-zA-Z0-9_.-]{1,120}\.(pdf|mp4|webm|mp3)$/i),
      size: z
        .number()
        .int()
        .min(1)
        .max(512 * 1024 * 1024),
    })
    .strict(),
  'upload-chunk': z
    .object({
      token: z.string().max(3000),
      offset: z
        .number()
        .int()
        .min(0)
        .max(512 * 1024 * 1024),
      content: z.string().max(1400000),
    })
    .strict(),
  'upload-finish': z.object({ token: z.string().max(3000) }).strict(),
};
for (const [action, schema] of Object.entries(uploads))
  studioCoursesRoute.post(`/:id/${action}`, async (c) => {
    const parsed = schema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'راجع الملف وحجمه قبل الرفع.' }, 422);
    return call(c, `studio.${action}`, { ...parsed.data, courseId: id.parse(c.req.param('id')) });
  });
