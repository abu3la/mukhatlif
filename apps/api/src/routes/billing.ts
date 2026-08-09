import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { canTransitionSubscription } from '@mukhtalif/types';
import { createSubscriptionSchema, updateSubscriptionStatusSchema } from '@mukhtalif/validation';
import { requireAdmin, type AppEnv } from '../auth';
import { getRepository } from '../repo';

export const plansRoute = new Hono<AppEnv>().get('/', async (c) => {
  const plans = await getRepository(c.env).listPlans();
  return c.json(plans);
});

function periodEnd(interval: 'month' | 'year'): string {
  const end = new Date();
  if (interval === 'month') end.setMonth(end.getMonth() + 1);
  else end.setFullYear(end.getFullYear() + 1);
  return end.toISOString();
}

/**
 * Manual, admin-driven activation until a payment gateway is wired in.
 * The plan price is snapshotted onto the subscription at creation so later
 * plan changes never affect existing subscribers.
 */
export const subscriptionsRoute = new Hono<AppEnv>()
  .get('/', requireAdmin, async (c) => {
    const subscriptions = await getRepository(c.env).listSubscriptions();
    return c.json(subscriptions);
  })
  .post('/', requireAdmin, zValidator('json', createSubscriptionSchema), async (c) => {
    const input = c.req.valid('json');
    const repo = getRepository(c.env);
    if (!(await repo.getUser(input.userId))) return c.json({ error: 'Unknown user' }, 422);
    const plan = await repo.getPlan(input.planId);
    if (!plan) return c.json({ error: 'Unknown plan' }, 422);
    const existing = await repo.getSubscriptionForUser(input.userId);
    if (existing) {
      return c.json({ error: 'User already has a subscription that is not canceled' }, 422);
    }
    const subscription = await repo.createSubscription(
      input,
      plan.priceMinor,
      plan.currency,
      periodEnd(plan.interval),
    );
    return c.json(subscription, 201);
  })
  .patch(
    '/:id/status',
    requireAdmin,
    zValidator('json', updateSubscriptionStatusSchema),
    async (c) => {
      const { status } = c.req.valid('json');
      const repo = getRepository(c.env);
      const current = await repo.getSubscription(c.req.param('id'));
      if (!current) return c.json({ error: 'Subscription not found' }, 404);
      if (!canTransitionSubscription(current.status, status)) {
        return c.json({ error: `Cannot move a ${current.status} subscription to ${status}` }, 422);
      }
      const subscription = await repo.updateSubscriptionStatus(current.id, status);
      return c.json(subscription);
    },
  );
