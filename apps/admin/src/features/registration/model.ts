import type { RegistrationField, RegistrationForm, RegistrationResponse } from '@mukhtalif/types';
export const fieldNames = {
  text: 'إجابة قصيرة',
  textarea: 'إجابة طويلة',
  email: 'بريد إلكتروني',
  phone: 'رقم جوال',
  number: 'رقم',
  select: 'اختيار واحد',
  multiselect: 'اختيارات متعددة',
  checkbox: 'تأكيد',
};
export const statusNames = {
  draft: 'مسودة',
  published: 'يستقبل التسجيلات',
  closed: 'التسجيل مغلق',
};
export const newField = (): RegistrationField => ({
  id: crypto.randomUUID(),
  label: 'سؤال جديد',
  type: 'text',
  required: false,
  help: '',
  options: [],
});
export function newForm(template = false): RegistrationForm {
  const fields: RegistrationField[] = template
    ? [
        ['الاسم الكامل', 'text'],
        ['رقم الجوال (واتساب)', 'phone'],
        ['البريد الإلكتروني', 'email'],
        ['العمر', 'number'],
        ['المدينة', 'text'],
        ['وضعك المهني', 'select'],
        ['مجالك أو تخصصك الحالي', 'text'],
        ['ما الذي ترغب في تحقيقه من حضور الورشة؟', 'textarea'],
        ['ألتزم بإبلاغ فريق مختلف إذا تعذّر حضوري بعد تأكيد التسجيل.', 'checkbox'],
      ].map(([label, type]) => ({
        ...newField(),
        label,
        type: type as RegistrationField['type'],
        required: true,
        options:
          type === 'select' ? ['طالب', 'موظف', 'صاحب عمل', 'عمل حر', 'باحث عن عمل', 'أخرى'] : [],
      }))
    : [newField()];
  return {
    id: crypto.randomUUID(),
    title: template ? 'التسجيل في ورشة تصميم الحياة المهنية' : 'نموذج جديد',
    description: template
      ? 'كيف تعيش عملك بشغف ومعنى؟\nمع أحمد عطار، كوتش مهني.\nأضف موعد الورشة ومكانها قبل نشر النموذج.'
      : '',
    successMessage: 'وصل طلب تسجيلك. سيتواصل معك فريق مختلف لتأكيد الحضور وإرسال التفاصيل.',
    status: 'draft',
    fields,
    revision: 0,
  };
}
export function responsesCsv(responses: RegistrationResponse[]) {
  const columns = new Map<string, string>();
  responses.forEach((r) => r.fields.forEach((f) => columns.set(f.id, f.label)));
  const cell = (value: unknown) => {
    let text = Array.isArray(value)
      ? value.join('، ')
      : typeof value === 'boolean'
        ? value
          ? 'نعم'
          : 'لا'
        : String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  return (
    '\ufeff' +
    [
      ['وقت التسجيل', ...columns.values()],
      ...responses.map((r) => [
        r.created_at,
        ...[...columns.keys()].map((id) => r.answers[id] ?? ''),
      ]),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  );
}
