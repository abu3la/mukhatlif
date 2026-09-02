import type { ClientSurface } from './surface';

export const NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES = [
  'pending',
  'synced',
  'failed',
  'unconfigured',
  'legacy_unverified',
] as const;

export type NewsletterSubscriptionSyncStatus =
  (typeof NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES)[number];

export const NEWSLETTER_CONSENT_EVENT_KINDS = ['explicit_consent', 'legacy_request'] as const;

export type NewsletterConsentEventKind = (typeof NEWSLETTER_CONSENT_EVENT_KINDS)[number];

/**
 * Privacy-minimized row returned only to an authorized Studio operator.
 * Provider errors, request provenance, consent metadata, and internal IDs stay
 * behind the API boundary.
 */
export interface NewsletterSubscriberListItem {
  email: string;
  firstName?: string;
  localStatus: NewsletterConsentEventKind;
  /** Last Mailchimp integration result stored locally, not a live member state. */
  mailchimpSyncStatus: NewsletterSubscriptionSyncStatus;
  requestedAt: string;
  updatedAt: string;
}

export const NEWSLETTER_LEGACY_FORM_IDS = ['1678cc0a', '79f340c2'] as const;
export type NewsletterLegacyFormId = (typeof NEWSLETTER_LEGACY_FORM_IDS)[number];

/** Server-derived request metadata. A raw client address is never stored. */
export interface NewsletterSubscriptionSourceMetadata {
  requestId: string;
  formVersion: 1;
  clientSurface?: ClientSurface;
  requestOrigin?: string;
  referrerOrigin?: string;
  referrerPath?: string;
  userAgent?: string;
  countryCode?: string;
  /** Explicit provenance for a future, separately reviewed legacy import. */
  legacySource?: 'wordpress_elementor';
  legacySourceVersion?: 1;
  legacyFormId?: NewsletterLegacyFormId;
  legacySubmissionId?: string;
  legacyMailchimpEvidence?: 'ever_success' | 'never_success';
}

/**
 * One canonical local contact. `synced` means only that Mailchimp accepted our
 * idempotent request; it is deliberately not a claim about the provider's
 * current subscribed, unsubscribed, cleaned, or pending member status.
 */
export interface NewsletterSubscription {
  id: string;
  email: string;
  firstName?: string;
  syncStatus: NewsletterSubscriptionSyncStatus;
  syncAttemptCount: number;
  syncAttemptedAt?: string;
  syncError?: string;
  latestConsentEventId?: string;
  createdAt: string;
  updatedAt: string;
}

interface NewsletterConsentEventBase {
  id: string;
  subscriptionId: string;
  email: string;
  firstName?: string;
  sourceMetadata: NewsletterSubscriptionSourceMetadata;
  createdAt: string;
}

/** Append-only proof of either explicit consent or an unverified legacy request. */
export type NewsletterConsentEvent =
  | (NewsletterConsentEventBase & {
      eventKind: 'explicit_consent';
      consentVersion: 1;
      consentAcceptedAt: string;
    })
  | (NewsletterConsentEventBase & {
      eventKind: 'legacy_request';
      consentVersion?: never;
      consentAcceptedAt?: never;
    });

export interface NewsletterSubscriptionRequestRecord {
  subscription: NewsletterSubscription;
  consentEvent: NewsletterConsentEvent;
}

/** Intentionally opaque public response. */
export interface NewsletterSubscriptionReceipt {
  accepted: true;
}
