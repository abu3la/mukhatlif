export type PlanInterval = 'month' | 'year';

export interface Plan {
  id: string;
  nameAr: string;
  nameEn?: string;
  /** Smallest currency unit (halalas). */
  priceMinor: number;
  currency: string;
  interval: PlanInterval;
}

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  active: ['past_due', 'canceled'],
  past_due: ['active', 'canceled'],
  // Admin staff may restore a canceled subscription after confirming entitlement.
  canceled: ['active'],
};

export function canTransitionSubscription(
  from: SubscriptionStatus,
  to: SubscriptionStatus,
): boolean {
  return SUBSCRIPTION_TRANSITIONS[from].includes(to);
}

export interface Subscription {
  id: string;
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  /** Price snapshot at subscription time — later plan changes never affect existing subscribers. */
  priceMinor: number;
  currency: string;
  /** ISO timestamp */
  currentPeriodEnd: string;
  /** ISO timestamp */
  createdAt: string;
}
