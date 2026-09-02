import { z } from 'zod';
import {
  CLIENT_SURFACES,
  FORM_NOTIFICATION_STATUSES,
  FORM_SUBMISSION_STATUSES,
  FORM_SUBMISSION_TYPES,
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

const storedIdentifier = (max: number) =>
  storedText.transform((value) => value.trim()).pipe(z.string().min(1).max(max));

const shortText = (max: number) => storedIdentifier(max);
const name = shortText(160);
const email = storedText
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().email().max(254));

function normalizePhoneDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - '٠'.charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - '۰'.charCodeAt(0)));
}

const phone = storedText
  .transform((value) => value.trim())
  .pipe(z.string().min(7).max(30))
  .transform(normalizePhoneDigits)
  .pipe(
    z
      .string()
      .regex(/^\+?[0-9\s().-]+$/)
      .refine((value) => value.replace(/\D/g, '').length >= 7, 'Phone number is too short'),
  );
const publicUrl = storedText
  .transform((value) => value.trim())
  .pipe(z.string().max(2048).url())
  .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol), {
    message: 'URL must use HTTP or HTTPS',
  });

export const sponsorshipFormPayloadSchema = z
  .object({
    organizationName: name,
    contactName: name,
    email,
    phone,
    message: shortText(4000).optional(),
  })
  .strict();

export const partnershipFormPayloadSchema = z
  .object({
    organizationName: name,
    contactName: name,
    email,
    phone,
    partnershipType: shortText(120).optional(),
    proposal: shortText(6000),
    organizationWebsite: publicUrl.optional(),
  })
  .strict();

export const guestSuggestionFormPayloadSchema = z
  .object({
    guestName: name,
    profession: shortText(160),
    showName: shortText(160).optional(),
    socialUrl: publicUrl.optional(),
    city: shortText(120).optional(),
    phone: phone.optional(),
    notes: shortText(4000).optional(),
  })
  .strict();

export const careersFormPayloadSchema = z
  .object({
    name,
    email,
    phone,
    desiredRole: shortText(160),
    whyMukhtalif: shortText(5000),
    skills: shortText(4000),
    socialUrl: publicUrl.optional(),
    portfolioUrl: publicUrl.optional(),
  })
  .strict();

export const productionServiceFormPayloadSchema = z
  .object({
    name,
    email,
    phone,
    organizationName: name.optional(),
    details: shortText(6000),
  })
  .strict();

export const guestReviewFormPayloadSchema = z
  .object({
    guestName: name,
    showName: shortText(160),
    email: email.optional(),
    overallRating: z.number().int().min(1).max(5),
    hostRating: z.number().int().min(1).max(5),
    notes: shortText(4000).optional(),
  })
  .strict();

export const formSubmissionPayloadSchemas = {
  sponsorship: sponsorshipFormPayloadSchema,
  partnership: partnershipFormPayloadSchema,
  guest_suggestion: guestSuggestionFormPayloadSchema,
  careers: careersFormPayloadSchema,
  production_service: productionServiceFormPayloadSchema,
  guest_review: guestReviewFormPayloadSchema,
} as const;

function publicEnvelope<Payload extends z.ZodTypeAny>(payload: Payload) {
  return z
    .object({
      payload,
      privacyAccepted: z.literal(true),
      /** Hidden honeypot. A non-empty value is accepted but never persisted. */
      companyWebsite: storedText.pipe(z.string().max(500)).optional(),
    })
    .strict();
}

export const publicFormSubmissionSchemas = {
  sponsorship: publicEnvelope(sponsorshipFormPayloadSchema),
  partnership: publicEnvelope(partnershipFormPayloadSchema),
  guest_suggestion: publicEnvelope(guestSuggestionFormPayloadSchema),
  careers: publicEnvelope(careersFormPayloadSchema),
  production_service: publicEnvelope(productionServiceFormPayloadSchema),
  guest_review: publicEnvelope(guestReviewFormPayloadSchema),
} as const;

export const formSubmissionTypeSchema = z.enum(FORM_SUBMISSION_TYPES);
export const formSubmissionStatusSchema = z.enum(FORM_SUBMISSION_STATUSES);
export const formNotificationStatusSchema = z.enum(FORM_NOTIFICATION_STATUSES);

export const formSubmissionSourceMetadataSchema = z
  .object({
    requestId: z.string().uuid(),
    formVersion: z.literal(1),
    privacyAcceptedAt: z.string().datetime({ offset: true }),
    clientSurface: z.enum(CLIENT_SURFACES).optional(),
    requestOrigin: z.string().max(2048).optional(),
    referrerOrigin: z.string().max(2048).optional(),
    referrerPath: z.string().max(2048).optional(),
    userAgent: z.string().max(500).optional(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();

export const formSubmissionAttachmentRefSchema = z
  .object({
    id: storedIdentifier(160),
    fileName: storedIdentifier(255),
    mimeType: storedIdentifier(120),
    byteSize: z
      .number()
      .int()
      .nonnegative()
      .max(25 * 1024 * 1024),
  })
  .strict();

export const formSubmissionListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).optional(),
    perPage: z.coerce.number().int().min(1).max(100).optional(),
    type: formSubmissionTypeSchema.optional(),
    status: formSubmissionStatusSchema.optional(),
    assigneeId: storedIdentifier(160).optional(),
  })
  .strict();

export const updateFormSubmissionSchema = z
  .object({
    status: formSubmissionStatusSchema.optional(),
    assigneeId: storedIdentifier(160).nullable().optional(),
    internalNotes: storedText.pipe(z.string().max(10_000)).optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, 'At least one field is required');

export type SponsorshipFormSubmissionInput = z.infer<
  (typeof publicFormSubmissionSchemas)['sponsorship']
>;
export type PartnershipFormSubmissionInput = z.infer<
  (typeof publicFormSubmissionSchemas)['partnership']
>;
export type GuestSuggestionFormSubmissionInput = z.infer<
  (typeof publicFormSubmissionSchemas)['guest_suggestion']
>;
export type CareersFormSubmissionInput = z.infer<(typeof publicFormSubmissionSchemas)['careers']>;
export type ProductionServiceFormSubmissionInput = z.infer<
  (typeof publicFormSubmissionSchemas)['production_service']
>;
export type GuestReviewFormSubmissionInput = z.infer<
  (typeof publicFormSubmissionSchemas)['guest_review']
>;
export type UpdateFormSubmissionInput = z.infer<typeof updateFormSubmissionSchema>;
export type FormSubmissionListQueryInput = z.infer<typeof formSubmissionListQuerySchema>;
