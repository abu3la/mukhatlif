'use client';

import Link from 'next/link';
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';
import { buildRequestPayload, type PublicRequestType } from './request-form-model';

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting'; message?: string }
  | { status: 'success' }
  | { status: 'unknown' }
  | { status: 'error'; message: string };

const RequestErrors = createContext<Record<string, string>>({});

interface RequestFormProps {
  apiOrigin: string | null;
  type: PublicRequestType;
  allowPartnershipChoice?: boolean;
  showNames?: string[];
}

interface FieldProps {
  id: string;
  label: string;
  name: string;
  children?: ReactNode;
  optional?: boolean;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  inputMode?: 'email' | 'tel' | 'url';
  placeholder?: string;
  maxLength?: number;
}

function Field({
  id,
  label,
  name,
  children,
  optional = false,
  hint,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
  maxLength,
}: FieldProps) {
  const ltr = type === 'email' || type === 'tel' || type === 'url';
  const error = useContext(RequestErrors)[name];
  const accessibility = {
    'aria-invalid': Boolean(error),
    'aria-describedby': `${id}-hint ${id}-error`,
  };
  return (
    <div className="request-form__field">
      <label htmlFor={id}>
        {label}
        {optional ? <span> (اختياري)</span> : null}
      </label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<typeof accessibility>, accessibility)
        : (children ?? (
            <input
              {...accessibility}
              id={id}
              name={name}
              type={type}
              autoComplete={autoComplete}
              inputMode={inputMode}
              placeholder={placeholder}
              maxLength={maxLength}
              required={!optional}
              dir={ltr ? 'ltr' : undefined}
            />
          ))}
      {hint ? (
        <p id={`${id}-hint`} className="request-form__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="request-form__feedback">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function TextareaField({
  id,
  label,
  name,
  optional = false,
  hint,
  maxLength,
  rows = 5,
}: Pick<FieldProps, 'id' | 'label' | 'name' | 'optional' | 'hint' | 'maxLength'> & {
  rows?: number;
}) {
  return (
    <Field id={id} label={label} name={name} optional={optional} hint={hint}>
      <textarea id={id} name={name} rows={rows} maxLength={maxLength} required={!optional} />
    </Field>
  );
}

function ContactFields({ prefix }: { prefix: string }) {
  return (
    <div className="request-form__row">
      <Field
        id={`${prefix}-email`}
        label="البريد الإلكتروني"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="name@example.com"
        maxLength={254}
      />
      <Field
        id={`${prefix}-phone`}
        label="رقم الهاتف"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="05XXXXXXXX"
        maxLength={30}
      />
    </div>
  );
}

function AttachmentField({ id, name, label }: { id: string; name: string; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const error = useContext(RequestErrors)[name];
  return (
    <div className="request-form__field">
      <label htmlFor={id}>
        {label}
        <span> (اختياري)</span>
      </label>
      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        className="visually-hidden"
        tabIndex={-1}
        accept="application/pdf,.pdf"
        aria-describedby={`${id}-hint ${id}-error`}
        aria-invalid={Boolean(error)}
        onChange={(event) => setFileName(event.currentTarget.files?.[0]?.name || '')}
      />
      <div className="public-upload-control">
        <button
          type="button"
          onClick={() => input.current?.click()}
          aria-label={'اختر ملف ' + label}
        >
          اختر ملفًا
        </button>
        <span>{fileName || 'لم تختر ملفًا'}</span>
        {fileName ? (
          <button
            type="button"
            className="public-text-action"
            aria-label={'إزالة ملف ' + label}
            onClick={() => {
              if (input.current) input.current.value = '';
              setFileName('');
            }}
          >
            إزالة
          </button>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="request-form__hint">
        PDF، حتى 10 ميغابايت.
      </p>
      {error ? (
        <p id={`${id}-error`} className="request-form__feedback">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SponsorFields({
  prefix,
  type,
  showNames = [],
}: {
  prefix: string;
  showNames?: string[];
  type: 'sponsorship' | 'partnership';
}) {
  return (
    <>
      <div className="request-form__row">
        <Field
          id={`${prefix}-organization`}
          label="اسم الجهة"
          name="organizationName"
          autoComplete="organization"
          maxLength={160}
        />
        <Field
          id={`${prefix}-contact`}
          label="اسم مسؤول التواصل"
          name="contactName"
          autoComplete="name"
          maxLength={160}
        />
      </div>
      <ContactFields prefix={prefix} />
      {type === 'partnership' ? (
        <>
          <div className="request-form__row">
            <Field
              id={`${prefix}-partnership-type`}
              label="مجال الشراكة"
              name="partnershipType"
              optional
              maxLength={120}
            />
            <Field
              id={`${prefix}-website`}
              label="موقع الجهة"
              name="organizationWebsite"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://example.com"
              maxLength={2048}
              optional
            />
          </div>
          <TextareaField
            id={`${prefix}-proposal`}
            label="مقترح الشراكة"
            name="proposal"
            hint="عرّفنا بالفكرة، وما الذي تتوقعه من مختلف."
            maxLength={6000}
          />
        </>
      ) : (
        <>
          <Field id={`${prefix}-program`} label="البرنامج" name="program" optional>
            <select id={`${prefix}-program`} name="program" defaultValue="">
              <option value="">لم أحدد برنامجًا</option>
              {showNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </Field>
          <Field id={`${prefix}-budget`} label="الميزانية التقريبية" name="budget" optional>
            <select id={`${prefix}-budget`} name="budget" defaultValue="">
              <option value="">لم أحدد بعد</option>
              {[
                'أقل من 25 ألف ريال',
                '25 إلى 75 ألف ريال',
                '75 إلى 150 ألف ريال',
                'أكثر من 150 ألف ريال',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <TextareaField
            id={`${prefix}-message`}
            label="ما هدف الرعاية؟"
            name="message"
            hint="اذكر البرنامج أو الحملة والفترة المتوقعة إن كانت محددة."
            maxLength={3500}
            optional
          />
        </>
      )}
    </>
  );
}

function GuestSuggestionFields({ prefix }: { prefix: string }) {
  return (
    <>
      <div className="request-form__row">
        <Field id={`${prefix}-guest`} label="اسم الضيف" name="guestName" maxLength={160} />
        <Field
          id={`${prefix}-profession`}
          label="مجاله أو صفته"
          name="profession"
          maxLength={160}
        />
      </div>
      <div className="request-form__row">
        <Field
          id={`${prefix}-show`}
          label="البرنامج المقترح"
          name="showName"
          maxLength={160}
          optional
        />
        <Field
          id={`${prefix}-city`}
          label="المدينة"
          name="city"
          autoComplete="address-level2"
          maxLength={120}
          optional
        />
      </div>
      <div className="request-form__row">
        <Field
          id={`${prefix}-social`}
          label="رابط تعريفي أو حساب اجتماعي"
          name="socialUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={2048}
          optional
        />
        <Field
          id={`${prefix}-phone`}
          label="رقم هاتفك"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="05XXXXXXXX"
          maxLength={30}
          optional
        />
      </div>
      <Field
        id={`${prefix}-topic`}
        label="موضوع الحوار"
        name="topic"
        maxLength={300}
        hint="ما التجربة التي تود أن يشاركها؟"
      />
      <TextareaField id={`${prefix}-notes`} label="لماذا تقترحه؟" name="notes" maxLength={3500} />
    </>
  );
}

function CareersFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field id={`${prefix}-name`} label="الاسم" name="name" autoComplete="name" maxLength={160} />
      <ContactFields prefix={prefix} />
      <Field
        id={`${prefix}-role`}
        label="المجال الذي ترغب بالعمل فيه"
        name="desiredRole"
        maxLength={160}
      />
      <TextareaField
        id={`${prefix}-why`}
        label="لماذا مختلف؟"
        name="whyMukhtalif"
        maxLength={5000}
      />
      <TextareaField
        id={`${prefix}-skills`}
        label="خبراتك ومهاراتك"
        name="skills"
        maxLength={4000}
      />
      <div className="request-form__row">
        <Field
          id={`${prefix}-social`}
          label="رابط حساب مهني"
          name="socialUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={2048}
          optional
        />
        <Field
          id={`${prefix}-portfolio`}
          label="رابط معرض الأعمال"
          name="portfolioUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          maxLength={2048}
          optional
        />
      </div>
      <div className="request-form__row">
        <AttachmentField id={`${prefix}-cv`} label="السيرة الذاتية" name="cv" />
        <AttachmentField id={`${prefix}-portfolio-file`} label="الأعمال" name="portfolioFile" />
      </div>
    </>
  );
}

function ProductionFields({ prefix }: { prefix: string }) {
  return (
    <>
      <div className="request-form__row">
        <Field
          id={`${prefix}-name`}
          label="الاسم"
          name="name"
          autoComplete="name"
          maxLength={160}
        />
        <Field
          id={`${prefix}-organization`}
          label="اسم الجهة"
          name="organizationName"
          autoComplete="organization"
          maxLength={160}
          optional
        />
      </div>
      <ContactFields prefix={prefix} />
      <TextareaField
        id={`${prefix}-details`}
        label="ما الخدمة التي تحتاجها؟"
        name="details"
        hint="اذكر نوع المشروع، الموعد التقريبي، والنتيجة التي تبحث عنها."
        maxLength={6000}
        rows={7}
      />
    </>
  );
}

function RatingField({ id, label, name }: { id: string; label: string; name: string }) {
  return (
    <Field id={id} label={label} name={name}>
      <select id={id} name={name} required defaultValue="">
        <option value="" disabled>
          اختر التقييم
        </option>
        <option value="5">5 - ممتاز</option>
        <option value="4">4 - جيد جدًا</option>
        <option value="3">3 - جيد</option>
        <option value="2">2 - مقبول</option>
        <option value="1">1 - يحتاج تحسينًا</option>
      </select>
    </Field>
  );
}

function GuestReviewFields({ prefix }: { prefix: string }) {
  return (
    <>
      <div className="request-form__row">
        <Field
          id={`${prefix}-guest`}
          label="اسمك"
          name="guestName"
          autoComplete="name"
          maxLength={160}
        />
        <Field
          id={`${prefix}-show`}
          label="البرنامج الذي شاركت فيه"
          name="showName"
          maxLength={160}
        />
      </div>
      <Field
        id={`${prefix}-email`}
        label="البريد الإلكتروني"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="name@example.com"
        maxLength={254}
        optional
      />
      <div className="request-form__row">
        <RatingField id={`${prefix}-overall`} label="تجربتك إجمالًا" name="overallRating" />
        <RatingField id={`${prefix}-host`} label="التواصل مع المضيف" name="hostRating" />
      </div>
      <TextareaField
        id={`${prefix}-notes`}
        label="ملاحظاتك"
        name="notes"
        hint="اكتب ما أعجبك وما يمكننا تحسينه."
        maxLength={4000}
        optional
      />
    </>
  );
}

function fieldsFor(type: PublicRequestType, prefix: string, showNames: string[]): ReactNode {
  switch (type) {
    case 'sponsorship':
    case 'partnership':
      return <SponsorFields prefix={prefix} type={type} showNames={showNames} />;
    case 'guest_suggestion':
      return <GuestSuggestionFields prefix={prefix} />;
    case 'careers':
      return <CareersFields prefix={prefix} />;
    case 'production_service':
      return <ProductionFields prefix={prefix} />;
    case 'guest_review':
      return <GuestReviewFields prefix={prefix} />;
  }
}

export function RequestForm({
  apiOrigin,
  type,
  allowPartnershipChoice = false,
  showNames = [],
}: RequestFormProps) {
  const prefix = useId().replaceAll(':', '');
  const [selectedType, setSelectedType] = useState<PublicRequestType>(type);
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const uploads = useRef(
    new Map<File, { email: string; kind: 'cv' | 'portfolio'; token: string; expiresAt: string }>(),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === 'submitting' || state.status === 'unknown') return;
    if (!apiOrigin) {
      setState({ status: 'error', message: 'خدمة الطلبات غير متاحة الآن. حاول لاحقًا.' });
      return;
    }

    const form = event.currentTarget;
    const errors: Record<string, string> = {};
    for (const field of Array.from(form.elements)) {
      if (
        !(
          field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement
        ) ||
        !field.name ||
        field.disabled
      )
        continue;
      if (
        field.validity.valueMissing ||
        (field.required && field.type !== 'checkbox' && !field.value.trim())
      )
        errors[field.name] =
          field.type === 'checkbox' ? 'وافق على الخصوصية للمتابعة.' : 'أكمل هذا الحقل.';
      else if (field.validity.typeMismatch)
        errors[field.name] =
          field.type === 'email'
            ? 'أدخل بريدًا إلكترونيًا صحيحًا.'
            : 'أدخل رابطًا صحيحًا يبدأ بـ https://.';
      else if (
        field.type === 'tel' &&
        field.value.trim() &&
        (!/^\+?[0-9٠-٩۰-۹\s().-]{7,30}$/.test(field.value.trim()) ||
          field.value.replace(/[^0-9٠-٩۰-۹]/g, '').length < 7)
      )
        errors[field.name] = 'أدخل رقم جوال صحيحًا.';
      else if (
        field.type === 'url' &&
        field.value.trim() &&
        !/^https?:\/\//i.test(field.value.trim())
      )
        errors[field.name] = 'أدخل رابطًا يبدأ بـ https:// أو http://.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setState({ status: 'error', message: 'راجع الحقول المحددة.' });
      (form.elements.namedItem(Object.keys(errors)[0]!) as HTMLElement | null)?.focus();
      return;
    }
    const data = new FormData(form);
    setState({ status: 'submitting' });

    try {
      const attachmentTokens: string[] = [];
      if (selectedType === 'careers' && !data.get('companyWebsite')) {
        const email = String(data.get('email') || '')
          .trim()
          .toLowerCase();
        for (const [field, kind, label] of [
          ['cv', 'cv', 'السيرة الذاتية'],
          ['portfolioFile', 'portfolio', 'ملف الأعمال'],
        ] as const) {
          const file = data.get(field);
          if (!(file instanceof File) || !file.size) continue;
          if (
            !file.name.toLowerCase().endsWith('.pdf') ||
            (file.type && file.type !== 'application/pdf') ||
            file.size > 10 * 1024 * 1024
          ) {
            setFieldErrors((current) => ({
              ...current,
              [field]: 'اختر ملف PDF بحجم لا يتجاوز 10 ميغابايت.',
            }));
            setState({
              status: 'error',
              message: `${label}: اختر ملف PDF بحجم لا يتجاوز 10 ميغابايت.`,
            });
            const input = form.elements.namedItem(field) as HTMLInputElement | null;
            input?.parentElement
              ?.querySelector<HTMLButtonElement>('.public-upload-control button')
              ?.focus();
            return;
          }
          const saved = uploads.current.get(file);
          if (
            saved &&
            saved.email === email &&
            saved.kind === kind &&
            Date.parse(saved.expiresAt) > Date.now() + 10000
          ) {
            attachmentTokens.push(saved.token);
            continue;
          }
          setState({ status: 'submitting', message: `جارٍ رفع ${label}…` });
          const uploadBody = new FormData();
          uploadBody.set('file', file);
          uploadBody.set('email', email);
          uploadBody.set('kind', kind);
          uploadBody.set('privacyAccepted', 'true');
          const upload = await fetch(`${apiOrigin.replace(/\/$/, '')}/forms/careers/attachments`, {
            method: 'POST',
            headers: { accept: 'application/json', [CLIENT_SURFACE_HEADER]: 'web' },
            body: uploadBody,
          });
          if (!upload.ok) {
            setState({
              status: 'error',
              message:
                upload.status === 413
                  ? `${label}: يتجاوز الملف الحجم المسموح.`
                  : upload.status === 400 || upload.status === 415
                    ? `${label}: تعذّر قراءة الملف. اختر ملف PDF صالحًا.`
                    : upload.status === 429
                      ? 'رفعت عدة ملفات خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'
                      : `تعذّر رفع ${label}. حاول مرة أخرى.`,
            });
            return;
          }
          const result: { token?: string; expiresAt?: string } = await upload.json();
          if (!result.token || !result.expiresAt) throw new Error('Upload incomplete');
          uploads.current.set(file, {
            email,
            kind,
            token: result.token,
            expiresAt: result.expiresAt,
          });
          attachmentTokens.push(result.token);
        }
      }
      setState({ status: 'submitting' });
      const response = await fetch(
        `${apiOrigin.replace(/\/$/, '')}/forms/${encodeURIComponent(selectedType)}`,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            [CLIENT_SURFACE_HEADER]: 'web',
          },
          body: JSON.stringify({
            payload: buildRequestPayload(selectedType, data),
            ...(attachmentTokens.length ? { attachmentTokens } : {}),
            privacyAccepted: true,
            companyWebsite:
              typeof data.get('companyWebsite') === 'string' ? data.get('companyWebsite') : '',
          }),
        },
      );

      if (!response.ok) {
        if (response.status === 503) {
          const result = (await response.json().catch(() => null)) as { code?: string } | null;
          if (result?.code === 'SUBMISSION_STATUS_UNKNOWN') {
            setState({ status: 'unknown' });
            return;
          }
        }
        const message =
          response.status === 429
            ? 'أرسلت عدة طلبات خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'
            : response.status === 400
              ? 'راجع الحقول ثم أرسل الطلب مرة أخرى.'
              : 'تعذّر إرسال الطلب. تحقق من اتصالك ثم حاول مرة أخرى.';
        setState({ status: 'error', message });
        return;
      }

      form.reset();
      uploads.current.clear();
      setState({ status: 'success' });
    } catch {
      setState({
        status: 'error',
        message: 'تعذّر إرسال الطلب. تحقق من اتصالك ثم حاول مرة أخرى.',
      });
    }
  }

  if (state.status === 'unknown')
    return (
      <section className="request-form__success" role="alert">
        <h2>لم تتأكد حالة طلبك بعد.</h2>
        <p>قد يكون الطلب وصل إلى الفريق. لا تعِد إرساله الآن لتجنب تكراره، وتحقق لاحقًا.</p>
        <Link className="public-text-action" href="/">
          العودة للرئيسية
        </Link>
      </section>
    );

  if (state.status === 'success') {
    return (
      <section
        className="request-form__success"
        role="status"
        aria-labelledby={`${prefix}-success-title`}
      >
        <h2 id={`${prefix}-success-title`}>وصل طلبك</h2>
        <p>حفظناه لدى فريق مختلف، وسنتواصل معك عبر البيانات التي أرسلتها.</p>
        <button type="button" onClick={() => setState({ status: 'idle' })}>
          إرسال طلب آخر
        </button>
      </section>
    );
  }

  return (
    <form
      className="request-form"
      onSubmit={submit}
      aria-busy={state.status === 'submitting'}
      noValidate
    >
      <fieldset className="request-form__controls" disabled={state.status === 'submitting'}>
        <RequestErrors.Provider value={fieldErrors}>
          {allowPartnershipChoice ? (
            <fieldset className="request-form__choice">
              <legend>نوع الطلب</legend>
              <label>
                <input
                  type="radio"
                  name="requestType"
                  value="sponsorship"
                  checked={selectedType === 'sponsorship'}
                  onChange={() => setSelectedType('sponsorship')}
                />
                <span>
                  <strong>رعاية</strong>
                  <small>رعاية برنامج أو حلقة أو حملة.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="requestType"
                  value="partnership"
                  checked={selectedType === 'partnership'}
                  onChange={() => setSelectedType('partnership')}
                />
                <span>
                  <strong>شراكة</strong>
                  <small>محتوى أو مشروع مشترك مع مختلف.</small>
                </span>
              </label>
            </fieldset>
          ) : null}

          {fieldsFor(selectedType, prefix, showNames)}
        </RequestErrors.Provider>

        <div className="request-form__honeypot" aria-hidden="true">
          <label htmlFor={`${prefix}-company-website`}>موقع الشركة</label>
          <input
            id={`${prefix}-company-website`}
            name="companyWebsite"
            type="text"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        <label className="request-form__consent">
          <input
            name="privacyAccepted"
            type="checkbox"
            required
            aria-invalid={Boolean(fieldErrors.privacyAccepted)}
            aria-describedby={`${prefix}-privacy-error`}
          />
          <span>
            أوافق على استخدام بياناتي للتواصل بخصوص هذا الطلب وفق{' '}
            <Link href="/privacy">سياسة الخصوصية</Link>.
          </span>
        </label>
        {fieldErrors.privacyAccepted ? (
          <p id={`${prefix}-privacy-error`} className="request-form__feedback">
            {fieldErrors.privacyAccepted}
          </p>
        ) : null}
      </fieldset>

      <div className="request-form__footer">
        <button
          className="request-form__submit"
          type="submit"
          disabled={state.status === 'submitting'}
        >
          {state.status === 'submitting' ? state.message || 'جارٍ الإرسال' : 'إرسال الطلب'}
        </button>
        <p className="request-form__feedback" aria-live="polite">
          {state.status === 'error' ? state.message : ''}
        </p>
      </div>
    </form>
  );
}
