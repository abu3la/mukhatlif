import { z } from 'zod';
import {
  CLIENT_SURFACES,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  NEWSLETTER_CONSENT_EVENT_KINDS,
  NEWSLETTER_LEGACY_FORM_IDS,
  NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES,
} from '@mukhtalif/types';

function hasUnsupportedStoredControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (
      code <= 8 ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      (code >= 127 && code <= 159)
    ) {
      return true;
    }
  }
  return false;
}

const storedText = z
  .string()
  .refine((value) => !hasUnsupportedStoredControl(value), 'Text has unsupported characters');

const normalizedEmail = storedText
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email().max(254));

const optionalFirstName = storedText
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(160))
  .optional();

export const newsletterSubscriptionRequestSchema = z
  .object({
    email: normalizedEmail,
    firstName: optionalFirstName,
    consentAccepted: z.literal(true),
    /** Hidden honeypot. A non-empty value is accepted but never persisted. */
    companyWebsite: storedText.pipe(z.string().max(500)).optional(),
  })
  .strict();

export const newsletterSubscriptionSyncStatusSchema = z.enum(NEWSLETTER_SUBSCRIPTION_SYNC_STATUSES);

const newsletterListPositiveInt = (max: number) => z.coerce.number().int().min(1).max(max);

/** Studio-only directory request: always paginated and rejects unknown body keys. */
export const newsletterSubscriberListQuerySchema = z
  .object({
    page: newsletterListPositiveInt(100_000).default(1),
    perPage: newsletterListPositiveInt(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    search: z.string().trim().min(1).max(200).optional(),
    localStatus: z.enum(NEWSLETTER_CONSENT_EVENT_KINDS).optional(),
    mailchimpStatus: newsletterSubscriptionSyncStatusSchema.optional(),
  })
  .strict();

export const newsletterSubscriptionSourceMetadataSchema = z
  .object({
    requestId: z.string().uuid(),
    formVersion: z.literal(1),
    clientSurface: z.enum(CLIENT_SURFACES).optional(),
    requestOrigin: z.string().max(2048).optional(),
    referrerOrigin: z.string().max(2048).optional(),
    referrerPath: z.string().max(2048).optional(),
    userAgent: z.string().max(500).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    legacySource: z.literal('wordpress_elementor').optional(),
    legacySourceVersion: z.literal(1).optional(),
    legacyFormId: z.enum(NEWSLETTER_LEGACY_FORM_IDS).optional(),
    legacySubmissionId: z.string().min(1).max(160).optional(),
    legacyMailchimpEvidence: z.enum(['ever_success', 'never_success']).optional(),
  })
  .strict()
  .superRefine((metadata, context) => {
    const legacyFields = [
      metadata.legacySource,
      metadata.legacySourceVersion,
      metadata.legacyFormId,
      metadata.legacySubmissionId,
      metadata.legacyMailchimpEvidence,
    ];
    const present = legacyFields.filter((value) => value !== undefined).length;
    if (present > 0 && present !== legacyFields.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Legacy newsletter provenance must be complete',
      });
    }
  });

export type NewsletterSubscriptionRequestInput = z.infer<
  typeof newsletterSubscriptionRequestSchema
>;

export type NewsletterSubscriberListQueryInput = z.infer<
  typeof newsletterSubscriberListQuerySchema
>;
