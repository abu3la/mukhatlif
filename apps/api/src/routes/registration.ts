import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requirePermission, type AppEnv } from '../auth';
import { getFormRateLimitSecret } from '../env';
import { getRepository } from '../repo';
import { formRateLimitKey } from '../security/form-rate-limit';
import { RegistrationError, registrationRequest } from '../registration/service';
import { registrationSubmissionSchema } from '@mukhtalif/validation';
export const publicRegistrationRoute = new Hono<AppEnv>();
export const studioRegistrationRoute = new Hono<AppEnv>();
for (const route of [publicRegistrationRoute, studioRegistrationRoute]) {
  route.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    await next();
  });
  route.onError((e, c) =>
    e instanceof RegistrationError
      ? c.json({ error: e.message, fields: e.fields }, e.status)
      : e instanceof z.ZodError || e instanceof SyntaxError
        ? c.json({ error: 'راجع بيانات النموذج.' }, 422)
        : c.json({ error: 'تعذّر إكمال الطلب.' }, 503),
  );
  route.use(
    '*',
    bodyLimit({
      maxSize: 128_000,
      onError: (c) => c.json({ error: 'حجم البيانات أكبر من المسموح.' }, 413),
    }),
  );
}
studioRegistrationRoute.use('*', requirePermission('forms.view'));
studioRegistrationRoute.get('/', async (c) => c.json(await registrationRequest(c.env, 'list', {})));
studioRegistrationRoute.post('/', requirePermission('forms.manage'), async (c) =>
  c.json(await registrationRequest(c.env, 'save', await c.req.json())),
);
studioRegistrationRoute.get('/:id/responses', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'));
  const query = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      query: z.string().max(150).optional(),
      before: z.string().datetime().optional(),
    })
    .parse(c.req.query());
  return c.json(await registrationRequest(c.env, 'responses', { id, ...query }));
});
publicRegistrationRoute.get('/:id', async (c) =>
  c.json(
    await registrationRequest(c.env, 'public', { id: z.string().uuid().parse(c.req.param('id')) }),
  ),
);
publicRegistrationRoute.post('/:id', async (c) => {
  const id = z.string().uuid().parse(c.req.param('id'));
  const address = c.env.CLIENT_ADDRESS ?? c.req.header('cf-connecting-ip')?.trim() ?? 'unknown';
  const key = await formRateLimitKey(getFormRateLimitSecret(c.env), 'registration', address);
  const rate = await getRepository(c.env).claimFormSubmissionRateLimit(key, 12, 900);
  if (!rate.allowed) {
    c.header('Retry-After', String(rate.retryAfterSeconds));
    return c.json({ error: 'محاولات كثيرة. حاول بعد قليل.' }, 429);
  }
  const body = registrationSubmissionSchema.parse(await c.req.json());
  if (body.companyWebsite) return c.json({ accepted: true });
  return c.json(await registrationRequest(c.env, 'submit', { id, body }), 201);
});
