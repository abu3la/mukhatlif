export const REGISTRATION_FIELD_TYPES = [
  'text',
  'textarea',
  'email',
  'phone',
  'number',
  'select',
  'multiselect',
  'checkbox',
] as const;
export type RegistrationFieldType = (typeof REGISTRATION_FIELD_TYPES)[number];
export interface RegistrationField {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  help: string;
  options: string[];
}
export interface RegistrationForm {
  id: string;
  title: string;
  description: string;
  successMessage: string;
  status: 'draft' | 'published' | 'closed';
  fields: RegistrationField[];
  revision: number;
}
export type RegistrationAnswers = Record<string, string | string[] | boolean>;
export interface RegistrationResponse {
  id: string;
  form_id: string;
  answers: RegistrationAnswers;
  fields: RegistrationField[];
  created_at: string;
}
export interface RegistrationResponsePage {
  items: RegistrationResponse[];
  total: number;
  page: number;
}
