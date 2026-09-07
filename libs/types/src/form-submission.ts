import type { ClientSurface } from './surface';

export const FORM_SUBMISSION_TYPES = [
  'sponsorship',
  'partnership',
  'guest_suggestion',
  'careers',
  'production_service',
  'guest_review',
] as const;

export type FormSubmissionType = (typeof FORM_SUBMISSION_TYPES)[number];

export const FORM_SUBMISSION_STATUSES = [
  'new',
  'in_review',
  'contacted',
  'resolved',
  'rejected',
  'spam',
] as const;

export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export const FORM_NOTIFICATION_STATUSES = [
  'pending',
  'sending',
  'sent',
  'failed',
  'unconfigured',
] as const;

export type FormNotificationStatus = (typeof FORM_NOTIFICATION_STATUSES)[number];

export interface SponsorshipFormPayload {
  organizationName: string;
  contactName: string;
  email: string;
  phone: string;
  message?: string;
}

export interface PartnershipFormPayload {
  organizationName: string;
  contactName: string;
  email: string;
  phone: string;
  partnershipType?: string;
  proposal: string;
  organizationWebsite?: string;
}

export interface GuestSuggestionFormPayload {
  guestName: string;
  profession: string;
  showName?: string;
  socialUrl?: string;
  city?: string;
  phone?: string;
  notes?: string;
}

export interface CareersFormPayload {
  name: string;
  email: string;
  phone: string;
  desiredRole: string;
  whyMukhtalif: string;
  skills: string;
  socialUrl?: string;
  portfolioUrl?: string;
}

export interface ProductionServiceFormPayload {
  name: string;
  email: string;
  phone: string;
  organizationName?: string;
  details: string;
}

export interface GuestReviewFormPayload {
  guestName: string;
  showName: string;
  email?: string;
  overallRating: number;
  hostRating: number;
  notes?: string;
}

export interface FormSubmissionPayloadByType {
  sponsorship: SponsorshipFormPayload;
  partnership: PartnershipFormPayload;
  guest_suggestion: GuestSuggestionFormPayload;
  careers: CareersFormPayload;
  production_service: ProductionServiceFormPayload;
  guest_review: GuestReviewFormPayload;
}

export type FormSubmissionPayload = FormSubmissionPayloadByType[FormSubmissionType];

/**
 * Verified private attachment. The API creates this reference from a validated
 * upload token; applicants cannot supply arbitrary object keys or URLs.
 */
export interface FormSubmissionAttachmentRef {
  id: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}

export interface CareersAttachmentUploadReceipt {
  attachment: FormSubmissionAttachmentRef;
  token: string;
  expiresAt: string;
}

/** Server-derived metadata. None of these values is trusted form content. */
export interface FormSubmissionSourceMetadata {
  requestId: string;
  formVersion: 1;
  privacyAcceptedAt: string;
  clientSurface?: ClientSurface;
  requestOrigin?: string;
  referrerOrigin?: string;
  referrerPath?: string;
  userAgent?: string;
  countryCode?: string;
}

interface FormSubmissionBase {
  id: string;
  status: FormSubmissionStatus;
  assigneeId?: string;
  internalNotes: string;
  attachmentRefs: FormSubmissionAttachmentRef[];
  sourceMetadata: FormSubmissionSourceMetadata;
  notificationStatus: FormNotificationStatus;
  notificationAttemptCount: number;
  notificationAttemptedAt?: string;
  notificationError?: string;
  notificationProviderMessageId?: string;
  statusUpdatedAt: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type FormSubmission = {
  [Type in FormSubmissionType]: FormSubmissionBase & {
    type: Type;
    payload: FormSubmissionPayloadByType[Type];
  };
}[FormSubmissionType];

/** Intentionally opaque public response: it does not reveal spam decisions. */
export interface FormSubmissionReceipt {
  accepted: true;
}
