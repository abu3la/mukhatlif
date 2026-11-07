import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Save,
  Copy,
  ArrowUp,
  ArrowDown,
  Trash2,
  Download,
  Eye,
  Pencil,
  ClipboardList,
  Search,
  ExternalLink,
} from 'lucide-react';
import {
  CLIENT_SURFACE_HEADER,
  REGISTRATION_FIELD_TYPES,
  type RegistrationField,
  type RegistrationForm,
  type RegistrationResponsePage,
} from '@mukhtalif/types';
import { registrationFormSchema } from '@mukhtalif/validation';
import { useAdminAuth } from '@/application';
import type { AdminAuthGateway } from '@/data';
import { Button } from '@/shared/ui/primitives';
import { publicWebsite } from '@/lib/public-website';
import { newForm, newField, fieldNames, statusNames, responsesCsv } from './model';
import './registration.css';
type Props = {
  authGateway: AdminAuthGateway;
  connection: { baseUrl: string; devUserId: string | null };
};
export function RegistrationManager(props: Props) {
  const { viewer } = useAdminAuth();
  return viewer?.permissions.includes('forms.view') ? (
    <Manager {...props} canManage={viewer.permissions.includes('forms.manage')} />
  ) : (
    <p role="alert">ليس لديك صلاحية عرض النماذج.</p>
  );
}
function Manager({ authGateway, connection, canManage }: Props & { canManage: boolean }) {
  const request = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const token = authGateway.getAccessToken();
      const r = await fetch(`${connection.baseUrl}/studio/registration${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          [CLIENT_SURFACE_HEADER]: 'studio',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(connection.devUserId ? { 'X-Dev-User': connection.devUserId } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          /[\u0600-\u06ff]/.test(data.error ?? '') ? data.error : 'تعذّر إكمال الطلب.',
        );
      return data;
    },
    [authGateway, connection],
  );
  const [forms, setForms] = useState<RegistrationForm[]>([]),
    [form, setForm] = useState<RegistrationForm | null>(null),
    [saved, setSaved] = useState('');
  const [tab, setTab] = useState('basics'),
    [activeField, setActiveField] = useState(''),
    [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [responses, setResponses] = useState<RegistrationResponsePage | null>(null),
    [page, setPage] = useState(1),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState('');
  const lock = useRef(false);
  const [focusTarget, setFocusTarget] = useState('');
  useEffect(() => {
    if (!focusTarget) return;
    document.getElementById(focusTarget)?.focus();
    setFocusTarget('');
  }, [focusTarget, tab, activeField]);
  const responseGeneration = useRef(0);
  const dirty = Boolean(form && JSON.stringify(form) !== saved);
  const origin =
    import.meta.env.DEV && import.meta.env.VITE_PUBLIC_WEB_URL
      ? String(import.meta.env.VITE_PUBLIC_WEB_URL).replace(/\/$/, '')
      : publicWebsite(location.hostname, import.meta.env.VITE_PRODUCTION_WEB_TARGET)?.href;
  const link = form && origin ? `${origin}/register/${form.id}` : '';
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<RegistrationForm[]>('')
      .then((data) => {
        if (active) {
          setForms(data);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [request, retry]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (tab !== 'responses' || !form?.revision) return;
    const generation = ++responseGeneration.current;
    setResponses(null);
    setError('');
    request<RegistrationResponsePage>(
      `/${form.id}/responses?page=${page}&query=${encodeURIComponent(search)}`,
    )
      .then((data) => {
        if (generation === responseGeneration.current) setResponses(data);
      })
      .catch((e) => {
        if (generation === responseGeneration.current) setError(e.message);
      });
    return () => {
      responseGeneration.current++;
    };
  }, [request, tab, form?.id, form?.revision, page, search, retry]);
  function select(next: RegistrationForm, isNew = false) {
    if (dirty && !window.confirm('لديك تغييرات غير محفوظة. هل تريد مغادرتها؟')) return;
    setForm(structuredClone(next));
    setSaved(isNew ? '' : JSON.stringify(next));
    setActiveField(next.fields[0]?.id ?? '');
    setTab('basics');
    setPreview(false);
    setPage(1);
    setSearch('');
    setQuery('');
    setError('');
    setNotice('');
  }
  const edit = (patch: Partial<RegistrationForm>) =>
    setForm((old) => (old ? { ...old, ...patch } : null));
  function editField(id: string, patch: Partial<RegistrationField>) {
    if (form) edit({ fields: form.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  }
  function move(index: number, offset: number) {
    if (!form) return;
    const fields = [...form.fields];
    [fields[index], fields[index + offset]] = [fields[index + offset], fields[index]];
    edit({ fields });
  }
  async function save() {
    if (lock.current || !form) return;
    const parsed = registrationFormSchema.safeParse(form);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      if (issue.path[0] === 'fields') {
        setTab('questions');
        const fieldId = form.fields[Number(issue.path[1])]?.id ?? '';
        setActiveField(fieldId);
        setFocusTarget(`question-${fieldId}-${issue.path[2] === 'options' ? 'options' : 'label'}`);
      } else {
        setTab(issue.path[0] === 'successMessage' ? 'settings' : 'basics');
        setFocusTarget(`form-${String(issue.path[0])}`);
      }
      setError('راجع العنوان والأسئلة والخيارات. لا تترك حقولًا مطلوبة فارغة.');
      return;
    }
    lock.current = true;
    setBusy('save');
    setError('');
    setNotice('');
    try {
      const result = await request<RegistrationForm>('', parsed.data);
      setForm(result);
      setSaved(JSON.stringify(result));
      setForms((old) => [result, ...old.filter((f) => f.id !== result.id)]);
      setNotice('حُفظ النموذج.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      lock.current = false;
    }
  }
  async function copy() {
    if (lock.current) return;
    lock.current = true;
    setBusy('copy');
    try {
      await navigator.clipboard.writeText(link);
      setNotice('نُسخ رابط التسجيل.');
    } catch {
      setError('تعذّر النسخ. انسخ الرابط من الحقل.');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  async function exportCsv() {
    if (lock.current || !form) return;
    lock.current = true;
    setBusy('export');
    setError('');
    try {
      const before = new Date().toISOString();
      let all: RegistrationResponsePage['items'] = [];
      for (let n = 1; ; n++) {
        const data = await request<RegistrationResponsePage>(
          `/${form.id}/responses?page=${n}&query=${encodeURIComponent(search)}&before=${encodeURIComponent(before)}`,
        );
        all = all.concat(data.items);
        if (all.length >= data.total || !data.items.length) break;
      }
      const url = URL.createObjectURL(
        new Blob([responsesCsv(all)], { type: 'text/csv;charset=utf-8' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `registrations-${form.id}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`صُدّرت ${all.length} إجابة.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  return (
    <div className="form-builder">
      <header className="form-builder-heading">
        <div>
          <h1>النماذج والتسجيلات</h1>
          <p>ابنِ النموذج، شارك رابطه، وتابع المسجلين.</p>
        </div>
        {canManage && (
          <div className="form-builder-actions">
            <Button disabled={!!busy} onClick={() => select(newForm(), true)}>
              <Plus size={18} /> نموذج جديد
            </Button>
            <Button disabled={!!busy} onClick={() => select(newForm(true), true)}>
              <ClipboardList size={18} /> قالب ورشة
            </Button>
          </div>
        )}
      </header>
      {error && (
        <p role="alert" className="form-builder-error">
          {error}{' '}
          <Button
            onClick={() => {
              if (
                dirty &&
                !window.confirm('إعادة التحميل ستلغي التغييرات غير المحفوظة. هل تريد المتابعة؟')
              )
                return;
              setForm(null);
              setSaved('');
              setRetry((n) => n + 1);
            }}
            aria-busy={loading}
            disabled={!!busy || loading}
          >
            إعادة التحميل
          </Button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {loading ? (
        <p role="status">
          تحميل النماذج <span className="button__spinner" />
        </p>
      ) : (
        <label className="form-builder-picker">
          النموذج
          <select
            value={form?.id ?? ''}
            disabled={!!busy}
            onChange={(e) => {
              const found = forms.find((f) => f.id === e.target.value);
              if (found) select(found);
            }}
          >
            <option value="" disabled>
              اختر نموذجًا
            </option>
            {form && !forms.some((f) => f.id === form.id) && (
              <option value={form.id}>{form.title} (غير محفوظ)</option>
            )}
            {forms.map((f) => (
              <option value={f.id} key={f.id}>
                {f.title} ({statusNames[f.status]})
              </option>
            ))}
          </select>
        </label>
      )}
      {!loading && !form && (
        <section className="form-builder-empty">
          <h2>{forms.length ? 'اختر نموذجًا لإدارته' : 'ابدأ أول نموذج'}</h2>
          <p>استخدم قالب الورشة أو أنشئ نموذجًا بأسئلتك.</p>
        </section>
      )}
      {form && (
        <>
          <nav className="form-builder-tabs" aria-label="إدارة النموذج">
            {[
              ['basics', 'التعريف'],
              ['questions', `الأسئلة (${form.fields.length})`],
              ['settings', 'النشر'],
              ['responses', 'المسجلون'],
            ].map(([key, label]) => (
              <Button
                key={key}
                aria-current={tab === key ? 'page' : undefined}
                disabled={!!busy || (key === 'responses' && !form.revision)}
                onClick={() => setTab(key)}
              >
                {label}
              </Button>
            ))}
            <Button onClick={() => setPreview(!preview)}>
              <Eye size={18} />
              {preview ? 'إغلاق المعاينة' : 'معاينة'}
            </Button>
          </nav>
          {tab === 'responses' ? (
            <section className="form-builder-panel">
              <div className="form-builder-actions">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setSearch(query);
                    setPage(1);
                  }}
                  className="form-builder-search"
                >
                  <label>
                    بحث في الإجابات
                    <input
                      value={query}
                      maxLength={150}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <Button
                    type="submit"
                    aria-busy={!responses && !error}
                    disabled={!responses && !error}
                  >
                    <Search size={18} /> بحث
                  </Button>
                </form>
                <Button
                  onClick={exportCsv}
                  aria-busy={busy === 'export'}
                  disabled={!!busy || !responses?.total}
                >
                  <Download size={18} /> تصدير CSV
                </Button>
              </div>
              {responses ? (
                <>
                  <p>عدد المسجلين: {responses.total}</p>
                  {!responses.items.length ? (
                    <p>لا توجد إجابات مطابقة.</p>
                  ) : (
                    <div className="form-builder-roster">
                      {responses.items.map((response, index) => (
                        <details key={response.id}>
                          <summary>
                            {(page - 1) * 100 + index + 1}.{' '}
                            {String(
                              response.answers[
                                response.fields.find((f) => f.type === 'text')?.id ?? ''
                              ] ?? 'تسجيل',
                            )}{' '}
                            <time>{new Date(response.created_at).toLocaleString('ar-SA')}</time>
                          </summary>
                          <dl>
                            {response.fields.map((field) => (
                              <div key={field.id}>
                                <dt>{field.label}</dt>
                                <dd>
                                  {Array.isArray(response.answers[field.id])
                                    ? (response.answers[field.id] as string[]).join('، ')
                                    : typeof response.answers[field.id] === 'boolean'
                                      ? response.answers[field.id]
                                        ? 'نعم'
                                        : 'لا'
                                      : String(response.answers[field.id] ?? 'لم يُجب')}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ))}
                    </div>
                  )}
                  <div className="form-builder-actions">
                    <Button disabled={page === 1} onClick={() => setPage((n) => n - 1)}>
                      السابق
                    </Button>
                    <span>
                      {page} / {Math.max(1, Math.ceil(responses.total / 100))}
                    </span>
                    <Button
                      disabled={page * 100 >= responses.total}
                      onClick={() => setPage((n) => n + 1)}
                    >
                      التالي
                    </Button>
                  </div>
                </>
              ) : (
                !error && (
                  <p role="status">
                    تحميل الإجابات <span className="button__spinner" />
                  </p>
                )
              )}
            </section>
          ) : (
            <div
              className={preview ? 'form-builder-workspace with-preview' : 'form-builder-workspace'}
            >
              <fieldset disabled={!canManage || !!busy} className="form-builder-panel">
                {tab === 'basics' && (
                  <>
                    <h2>تعريف النموذج</h2>
                    <label>
                      عنوان النموذج
                      <input
                        id="form-title"
                        value={form.title}
                        maxLength={180}
                        onChange={(e) => edit({ title: e.target.value })}
                      />
                    </label>
                    <label>
                      الوصف وتفاصيل الموعد والمكان
                      <textarea
                        rows={7}
                        value={form.description}
                        maxLength={6000}
                        onChange={(e) => edit({ description: e.target.value })}
                      />
                    </label>
                  </>
                )}
                {tab === 'questions' && (
                  <>
                    <h2>أسئلة التسجيل</h2>
                    <div className="form-builder-questions">
                      {form.fields.map((field, index) => (
                        <section className="form-builder-question" key={field.id}>
                          <button
                            type="button"
                            className="form-builder-question-title"
                            aria-expanded={activeField === field.id}
                            onClick={() => setActiveField(activeField === field.id ? '' : field.id)}
                          >
                            <span>
                              {index + 1}. {field.label || 'سؤال بدون عنوان'}
                            </span>
                            <Pencil size={17} />
                          </button>
                          {activeField === field.id && (
                            <div className="form-builder-question-body">
                              <label>
                                السؤال
                                <input
                                  id={`question-${field.id}-label`}
                                  value={field.label}
                                  maxLength={180}
                                  onChange={(e) => editField(field.id, { label: e.target.value })}
                                />
                              </label>
                              <label>
                                نوع الإجابة
                                <select
                                  value={field.type}
                                  onChange={(e) =>
                                    editField(field.id, {
                                      type: e.target.value as RegistrationField['type'],
                                    })
                                  }
                                >
                                  {REGISTRATION_FIELD_TYPES.map((type) => (
                                    <option value={type} key={type}>
                                      {fieldNames[type]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                توضيح اختياري
                                <input
                                  value={field.help}
                                  maxLength={500}
                                  onChange={(e) => editField(field.id, { help: e.target.value })}
                                />
                              </label>
                              {['select', 'multiselect'].includes(field.type) && (
                                <label>
                                  الخيارات، كل خيار في سطر
                                  <textarea
                                    id={`question-${field.id}-options`}
                                    rows={5}
                                    value={field.options.join('\n')}
                                    onChange={(e) =>
                                      editField(field.id, { options: e.target.value.split('\n') })
                                    }
                                  />
                                </label>
                              )}
                              <label className="form-builder-check">
                                <input
                                  type="checkbox"
                                  checked={field.required}
                                  onChange={(e) =>
                                    editField(field.id, { required: e.target.checked })
                                  }
                                />
                                إجابة مطلوبة
                              </label>
                              <div className="form-builder-actions">
                                <Button
                                  disabled={index === 0}
                                  aria-label="نقل السؤال للأعلى"
                                  onClick={() => move(index, -1)}
                                >
                                  <ArrowUp size={18} />
                                </Button>
                                <Button
                                  disabled={index === form.fields.length - 1}
                                  aria-label="نقل السؤال للأسفل"
                                  onClick={() => move(index, 1)}
                                >
                                  <ArrowDown size={18} />
                                </Button>
                                <Button
                                  disabled={form.fields.length === 1}
                                  onClick={() =>
                                    edit({ fields: form.fields.filter((f) => f.id !== field.id) })
                                  }
                                >
                                  <Trash2 size={18} /> إزالة السؤال
                                </Button>
                              </div>
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                    <Button
                      disabled={form.fields.length >= 40}
                      onClick={() => {
                        const f = newField();
                        edit({ fields: [...form.fields, f] });
                        setActiveField(f.id);
                      }}
                    >
                      <Plus size={18} /> إضافة سؤال
                    </Button>
                  </>
                )}
                {tab === 'settings' && (
                  <>
                    <h2>النشر والاستقبال</h2>
                    <label>
                      حالة النموذج
                      <select
                        value={form.status}
                        onChange={(e) =>
                          edit({ status: e.target.value as RegistrationForm['status'] })
                        }
                      >
                        {Object.entries(statusNames).map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>تُطبق الحالة بعد حفظ النموذج. المسودة لا تظهر للزوار.</p>
                    <label>
                      رسالة بعد التسجيل
                      <textarea
                        id="form-successMessage"
                        value={form.successMessage}
                        maxLength={1000}
                        onChange={(e) => edit({ successMessage: e.target.value })}
                      />
                    </label>
                    {form.revision > 0 && form.status !== 'draft' && link && (
                      <label>
                        رابط التسجيل
                        <input value={link} readOnly dir="ltr" />
                        <div className="form-builder-actions">
                          <Button
                            onClick={copy}
                            aria-busy={busy === 'copy'}
                            disabled={dirty || !!busy}
                          >
                            <Copy size={18} /> نسخ الرابط
                          </Button>
                          <a href={link} target="_blank" rel="noreferrer">
                            <ExternalLink size={18} /> فتح النموذج
                          </a>
                        </div>
                      </label>
                    )}
                    <p>
                      يظهر إشعار استخدام البيانات تلقائيًا. الردود لا تُعرض إلا للمصرح لهم في لوحة
                      التحكم.
                    </p>
                  </>
                )}
              </fieldset>
              {preview && (
                <aside className="form-builder-preview" aria-label="معاينة النموذج">
                  <h2>معاينة</h2>
                  <h3>{form.title}</h3>
                  <p className="form-builder-description">{form.description}</p>
                  {form.fields.map((f) => (
                    <div key={f.id}>
                      <strong>
                        {f.label}
                        {f.required ? ' *' : ''}
                      </strong>
                      {f.help && <p>{f.help}</p>}
                      <p>
                        {['select', 'multiselect'].includes(f.type)
                          ? f.options.join(' / ')
                          : fieldNames[f.type]}
                      </p>
                    </div>
                  ))}
                  <p>بعد التسجيل: {form.successMessage}</p>
                </aside>
              )}
            </div>
          )}
          {canManage && tab !== 'responses' && (
            <footer className="form-builder-save">
              <div>
                <strong>{form.title}</strong>
                <p>{dirty ? 'تغييرات غير محفوظة' : statusNames[form.status]}</p>
              </div>
              <Button
                variant="primary"
                aria-busy={busy === 'save'}
                disabled={!!busy || !dirty}
                onClick={save}
              >
                <Save size={18} /> حفظ النموذج
              </Button>
            </footer>
          )}
        </>
      )}
    </div>
  );
}
