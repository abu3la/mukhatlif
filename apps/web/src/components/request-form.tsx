'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';
import {
  buildRequestPayload,
  type PublicRequestType,
} from './request-form-model';

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; message: string };

interface RequestFormProps {
  apiOrigin: string | null;
  type: PublicRequestType;
  allowPartnershipChoice?: boolean;
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
  return (
    <div className="request-form__field">
      <label htmlFor={id}>
        {label}
        {optional ? <span> (اختياري)</span> : null}
      </label>
      {children ?? (
        <input
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
      )}
      {hint ? <p className="request-form__hint">{hint}</p> : null}
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
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        required={!optional}
      />
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

function SponsorFields({
  prefix,
  type,
}: {
  prefix: string;
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
        <TextareaField
          id={`${prefix}-message`}
          label="تفاصيل الرعاية"
          name="message"
          hint="اذكر البرنامج أو الحملة والفترة المتوقعة إن كانت محددة."
          maxLength={4000}
          optional
        />
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
      <TextareaField
        id={`${prefix}-notes`}
        label="لماذا تقترحه؟"
        name="notes"
        maxLength={4000}
        optional
      />
    </>
  );
}

function CareersFields({ prefix }: { prefix: string }) {
  return (
    <>
      <Field
        id={`${prefix}-name`}
        label="الاسم"
        name="name"
        autoComplete="name"
        maxLength={160}
      />
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
        <RatingField
          id={`${prefix}-overall`}
          label="تجربتك إجمالًا"
          name="overallRating"
        />
        <RatingField
          id={`${prefix}-host`}
          label="التواصل مع المضيف"
          name="hostRating"
        />
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

function fieldsFor(type: PublicRequestType, prefix: string): ReactNode {
  switch (type) {
    case 'sponsorship':
    case 'partnership':
      return <SponsorFields prefix={prefix} type={type} />;
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
}: RequestFormProps) {
  const prefix = useId().replaceAll(':', '');
  const [selectedType, setSelectedType] = useState<PublicRequestType>(type);
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === 'submitting') return;
    if (!apiOrigin) {
      setState({ status: 'error', message: 'خدمة الطلبات غير متاحة الآن. حاول لاحقًا.' });
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    setState({ status: 'submitting' });

    try {
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
            privacyAccepted: true,
            companyWebsite:
              typeof data.get('companyWebsite') === 'string'
                ? data.get('companyWebsite')
                : '',
          }),
        },
      );

      if (!response.ok) {
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
      setState({ status: 'success' });
    } catch {
      setState({
        status: 'error',
        message: 'تعذّر إرسال الطلب. تحقق من اتصالك ثم حاول مرة أخرى.',
      });
    }
  }

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
    <form className="request-form" onSubmit={submit}>
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

      {fieldsFor(selectedType, prefix)}

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
        <input name="privacyAccepted" type="checkbox" required />
        <span>أوافق على استخدام بياناتي للتواصل بخصوص هذا الطلب.</span>
      </label>

      <div className="request-form__footer">
        <button
          className="request-form__submit"
          type="submit"
          disabled={state.status === 'submitting'}
        >
          {state.status === 'submitting' ? 'جارٍ الإرسال' : 'إرسال الطلب'}
        </button>
        <p className="request-form__feedback" aria-live="polite">
          {state.status === 'error' ? state.message : ''}
        </p>
      </div>
    </form>
  );
}
