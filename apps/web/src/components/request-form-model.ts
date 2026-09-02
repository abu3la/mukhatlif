import type {
  FormSubmissionPayloadByType,
  FormSubmissionType,
} from '@mukhtalif/types';

export type PublicRequestType = FormSubmissionType;

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function optionalText(formData: FormData, key: string): string | undefined {
  return text(formData, key) || undefined;
}

/** Maps browser fields to the API contract and omits blank optional values. */
export function buildRequestPayload<Type extends PublicRequestType>(
  type: Type,
  formData: FormData,
): FormSubmissionPayloadByType[Type] {
  switch (type) {
    case 'sponsorship':
      return {
        organizationName: text(formData, 'organizationName'),
        contactName: text(formData, 'contactName'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        message: optionalText(formData, 'message'),
      } as FormSubmissionPayloadByType[Type];
    case 'partnership':
      return {
        organizationName: text(formData, 'organizationName'),
        contactName: text(formData, 'contactName'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        partnershipType: optionalText(formData, 'partnershipType'),
        proposal: text(formData, 'proposal'),
        organizationWebsite: optionalText(formData, 'organizationWebsite'),
      } as FormSubmissionPayloadByType[Type];
    case 'guest_suggestion':
      return {
        guestName: text(formData, 'guestName'),
        profession: text(formData, 'profession'),
        showName: optionalText(formData, 'showName'),
        socialUrl: optionalText(formData, 'socialUrl'),
        city: optionalText(formData, 'city'),
        phone: optionalText(formData, 'phone'),
        notes: optionalText(formData, 'notes'),
      } as FormSubmissionPayloadByType[Type];
    case 'careers':
      return {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        desiredRole: text(formData, 'desiredRole'),
        whyMukhtalif: text(formData, 'whyMukhtalif'),
        skills: text(formData, 'skills'),
        socialUrl: optionalText(formData, 'socialUrl'),
        portfolioUrl: optionalText(formData, 'portfolioUrl'),
      } as FormSubmissionPayloadByType[Type];
    case 'production_service':
      return {
        name: text(formData, 'name'),
        email: text(formData, 'email'),
        phone: text(formData, 'phone'),
        organizationName: optionalText(formData, 'organizationName'),
        details: text(formData, 'details'),
      } as FormSubmissionPayloadByType[Type];
    case 'guest_review':
      return {
        guestName: text(formData, 'guestName'),
        showName: text(formData, 'showName'),
        email: optionalText(formData, 'email'),
        overallRating: Number(text(formData, 'overallRating')),
        hostRating: Number(text(formData, 'hostRating')),
        notes: optionalText(formData, 'notes'),
      } as FormSubmissionPayloadByType[Type];
  }
}
