import { z } from 'zod';
import {
  REGISTRATION_FIELD_TYPES,
  type RegistrationAnswers,
  type RegistrationField,
} from '@mukhtalif/types';
const text = (max: number) => z.string().trim().max(max);
export const registrationFieldSchema = z
  .object({
    id: z.string().uuid(),
    label: text(180).min(1),
    type: z.enum(REGISTRATION_FIELD_TYPES),
    required: z.boolean(),
    help: text(500),
    options: z.array(text(180).min(1)).max(40),
  })
  .strict()
  .superRefine((field, context) => {
    if (
      ['select', 'multiselect'].includes(field.type) &&
      (!field.options.length || new Set(field.options).size !== field.options.length)
    )
      context.addIssue({ code: 'custom', path: ['options'], message: 'أضف خيارات مختلفة للسؤال.' });
  });
export const registrationFormSchema = z
  .object({
    id: z.string().uuid(),
    title: text(180).min(1),
    description: text(6000),
    successMessage: text(1000).min(1),
    status: z.enum(['draft', 'published', 'closed']),
    fields: z.array(registrationFieldSchema).min(1).max(40),
    revision: z.number().int().min(0),
  })
  .strict()
  .superRefine((form, context) => {
    if (new Set(form.fields.map((f) => f.id)).size !== form.fields.length)
      context.addIssue({ code: 'custom', path: ['fields'], message: 'معرّفات الأسئلة مكررة.' });
  });
export const registrationSubmissionSchema = z
  .object({
    requestId: z.string().uuid(),
    revision: z.number().int().positive(),
    answers: z.record(z.union([text(6000), z.array(text(180)).max(40), z.boolean()])),
    privacyAccepted: z.literal(true),
    companyWebsite: text(500).optional(),
  })
  .strict();
export function validateRegistrationAnswers(
  fields: RegistrationField[],
  answers: RegistrationAnswers,
) {
  const errors: Record<string, string> = {};
  const clean: RegistrationAnswers = {};
  if (Object.keys(answers).some((key) => !fields.some((f) => f.id === key)))
    errors._form = 'تغيّرت الأسئلة. حدّث الصفحة.';
  for (const field of fields) {
    const value = answers[field.id];
    const empty =
      value === undefined ||
      value === '' ||
      value === false ||
      (Array.isArray(value) && !value.length);
    if (empty) {
      if (field.required) errors[field.id] = 'أجب عن هذا السؤال.';
      continue;
    }
    if (field.type === 'checkbox') {
      if (typeof value !== 'boolean') errors[field.id] = 'حدد خيار التأكيد.';
      else clean[field.id] = value;
    } else if (field.type === 'multiselect') {
      if (
        !Array.isArray(value) ||
        new Set(value).size !== value.length ||
        value.some((v) => !field.options.includes(v))
      )
        errors[field.id] = 'اختر من الخيارات المتاحة.';
      else clean[field.id] = value;
    } else if (typeof value !== 'string') errors[field.id] = 'أدخل إجابة نصية.';
    else {
      let normalized = value.trim();
      if (field.type === 'number' || field.type === 'phone')
        normalized = normalized
          .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
          .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
      if (!normalized || normalized.length > (field.type === 'textarea' ? 6000 : 500))
        errors[field.id] = 'راجع طول الإجابة.';
      else if (field.type === 'email' && !z.string().email().max(254).safeParse(normalized).success)
        errors[field.id] = 'أدخل بريدًا إلكترونيًا صحيحًا.';
      else if (
        field.type === 'phone' &&
        (!/^\+?[\d ().-]+$/.test(normalized) ||
          normalized.replace(/\D/g, '').length < 7 ||
          normalized.replace(/\D/g, '').length > 15)
      )
        errors[field.id] = 'أدخل رقم جوال صحيحًا.';
      else if (field.type === 'number' && !/^-?\d+(\.\d+)?$/.test(normalized))
        errors[field.id] = 'أدخل رقمًا صحيحًا.';
      else if (field.type === 'select' && !field.options.includes(normalized))
        errors[field.id] = 'اختر من الخيارات المتاحة.';
      else clean[field.id] = field.type === 'email' ? normalized.toLowerCase() : normalized;
    }
  }
  return { errors, answers: clean };
}
