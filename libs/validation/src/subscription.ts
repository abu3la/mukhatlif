import { z } from 'zod';
import { SUBSCRIPTION_STATUSES } from '@mukhtalif/types';

export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);

/**
 * Admin-side manual activation. The price is snapshotted from the plan on the
 * server — clients never send an amount.
 */
export const createSubscriptionSchema = z.object({
  userId: z.string().min(1),
  planId: z.string().min(1),
});
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>;

export const updateSubscriptionStatusSchema = z.object({
  status: subscriptionStatusSchema,
});
export type UpdateSubscriptionStatusInput = z.infer<typeof updateSubscriptionStatusSchema>;
