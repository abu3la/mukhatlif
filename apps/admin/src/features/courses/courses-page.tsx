import { UploadProgress } from '@/shared/ui/upload-progress';
import { Button } from '@/shared/ui/primitives';
import { COURSE_UPLOAD_LIMITS, courseUploadLimit } from '@mukhtalif/types';
import { RichTextEditor } from '../articles/ui/rich-text-editor';
import { richTextDocumentSchema } from '@mukhtalif/validation';
import type { RichTextDocument } from '@mukhtalif/types';
import { useCallback, useEffect, useState, useRef, type ReactNode } from 'react';
import {
  CLIENT_SURFACE_HEADER,
  type CourseDefinition,
  type CourseLesson,
  type CourseQuiz,
  type CourseAssignment,
  type CourseResource,
  type CourseSummary,
  type CourseRosterEntry,
} from '@mukhtalif/types';
import type { AdminAuthGateway } from '@/data';
import { useAdminAuth } from '@/application';
import './courses.css';

type Connection = { baseUrl: string; devUserId: string | null };
type Request = <T>(path: string, body?: unknown) => Promise<T>;
type Roster = CourseRosterEntry & {
  submissions: {
    name: string;
    assignment_title: string;
    answer: string;
    status: string;
    comments: string;
  }[];
};
const uid = () => crypto.randomUUID();
const blank = (): CourseDefinition => ({
  id: uid(),
  title: '',
  description: '',
  category: '',
  skill: '',
  level: 'مبتدئ',
  instructor: '',
  price: 0,
  durationMinutes: 0,
  lessonCount: 0,
  published: false,
  lessons: [],
  resources: [],
});
const newLesson = (): CourseLesson => ({
  id: uid(),
  title: '',
  body: '',
  video: '',
  durationSeconds: 0,
  resources: [],
});
export function CoursesManagement({
  authGateway,
  connection,
}: {
  authGateway: AdminAuthGateway;
  connection: Connection;
}) {
  const { viewer } = useAdminAuth();
  return viewer?.role === 'admin' ? (
    <CourseManager key={viewer.id} authGateway={authGateway} connection={connection} />
  ) : (
    <p role="alert">إدارة الدورات متاحة للمدير فقط.</p>
  );
}
function CourseManager({
  authGateway,
  connection,
}: {
  authGateway: AdminAuthGateway;
  connection: Connection;
}) {
  const request: Request = useCallback(
    async <T,>(path: string, body?: unknown): Promise<T> => {
      const token = authGateway.getAccessToken();
      const response = await fetch(`${connection.baseUrl}/studio/courses${path}`, {
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
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          /[\u0600-\u06ff]/.test(result.error ?? '')
            ? result.error
            : 'تعذّر إكمال الطلب. حاول مجددًا.',
        );
      return result as T;
    },
    [authGateway, connection],
  );
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [course, setCourse] = useState<CourseDefinition | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [roster, setRoster] = useState<Roster[]>([]);
  const [tab, setTab] = useState('content');
  const [section, setSection] = useState('basics');
  const [freshLesson, setFreshLesson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    request<CourseSummary[]>('')
      .then((result) => {
        if (active) {
          setCourses(result);
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
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const patch = (change: Partial<CourseDefinition>) =>
    setCourse((old) => (old ? { ...old, ...change } : old));
  const loadRoster = () =>
    run(async () => {
      if (course) setRoster(await request<Roster[]>(`/${course.id}/learners`));
    });
  return (
    <main className="studio-courses">
      <header>
        <h1>أكاديمية مختلف</h1>
        <p>إدارة المحتوى والتسجيلات والتقييم. جميع عمليات الدفع هنا تجريبية.</p>
      </header>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button onClick={() => setRetry(retry + 1)}>أعد الاتصال</button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="studio-courses-toolbar">
        <label>
          الدورة
          <select
            disabled={busy}
            value={persisted ? (course?.id ?? '') : ''}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return;
              void run(async () => {
                setCourse(await request<CourseDefinition>(`/${id}`));
                setPersisted(true);
                setTab('content');
                setSection('basics');
                setRoster([]);
              });
            }}
          >
            <option value="">اختر دورة</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} {c.published ? '(منشورة)' : '(مسودة)'}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={busy}
          onClick={() => {
            setCourse(blank());
            setPersisted(false);
            setRoster([]);
            setTab('content');
            setSection('basics');
          }}
        >
          دورة جديدة
        </button>
      </div>
      {loading && <p role="status">جار تحميل الدورات…</p>}
      {course && (
        <>
          <nav aria-label="إدارة الدورة">
            <button
              aria-current={tab === 'content' ? 'page' : undefined}
              onClick={() => setTab('content')}
            >
              المحتوى
            </button>
            <button
              disabled={!persisted}
              aria-current={tab === 'learners' ? 'page' : undefined}
              onClick={() => {
                setTab('learners');
                void loadRoster();
              }}
            >
              المتعلمون والتقييم
            </button>
          </nav>
          {tab === 'content' ? (
            <form
              key={course.id}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const invalid = e.currentTarget.querySelector<HTMLInputElement>(
                  'input:invalid, select:invalid, textarea:invalid',
                );
                if (invalid) {
                  const parent = invalid.closest<HTMLDetailsElement>('[data-course-section]');
                  if (parent?.dataset.courseSection) {
                    parent.open = true;
                    setSection(parent.dataset.courseSection);
                  }
                  const lesson = invalid.closest<HTMLDetailsElement>(
                    'details.studio-course-lesson',
                  );
                  if (lesson) lesson.open = true;
                  requestAnimationFrame(() => {
                    invalid.focus();
                    invalid.reportValidity();
                  });
                  return;
                }
                void run(async () => {
                  const result = await request<CourseDefinition>('', course);
                  setCourse(result);
                  setPersisted(true);
                  setNotice('حُفظت الدورة.');
                  setRetry(retry + 1);
                });
              }}
            >
              <fieldset disabled={busy} className="studio-course-fields">
                <EditorSection
                  id="basics"
                  title="معلومات الدورة"
                  summary={course.title || 'الاسم، المدرّب والتصنيف'}
                  open={section === 'basics'}
                  onToggle={setSection}
                >
                  <Field title="اسم الدورة">
                    <input
                      required
                      maxLength={200}
                      value={course.title}
                      onChange={(e) => patch({ title: e.target.value })}
                    />
                  </Field>
                  <div className="studio-course-columns">
                    {(['category', 'skill', 'instructor'] as const).map((key, i) => (
                      <Field key={key} title={['المجال', 'المهارة', 'المدرّب'][i]}>
                        <input
                          maxLength={200}
                          value={course[key]}
                          onChange={(e) => patch({ [key]: e.target.value })}
                        />
                      </Field>
                    ))}
                    <Field title="المستوى">
                      <select
                        value={course.level}
                        onChange={(e) => patch({ level: e.target.value })}
                      >
                        {['مبتدئ', 'متوسط', 'متقدم'].map((level) => (
                          <option key={level}>{level}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </EditorSection>
                <EditorSection
                  id="intro"
                  title="صفحة التعريف"
                  summary={
                    course.description
                      ? 'الوصف والمقطع التعريفي'
                      : 'عرّف المتدرب بالدورة قبل التسجيل'
                  }
                  open={section === 'intro'}
                  onToggle={setSection}
                >
                  <CourseTextEditor
                    disabled={busy}
                    key={`${course.id}-description`}
                    title="وصف الدورة"
                    text={course.description}
                    document={course.descriptionDocument}
                    onChange={(description, descriptionDocument) =>
                      patch({ description, descriptionDocument })
                    }
                  />
                  <CourseTextEditor
                    disabled={busy}
                    key={`${course.id}-overview`}
                    title="ماذا سيتعلم المتدرب؟"
                    text={course.overview ?? ''}
                    document={course.overviewDocument}
                    onChange={(overview, overviewDocument) => patch({ overview, overviewDocument })}
                  />
                  <Field title="لمن هذه الدورة؟">
                    <textarea
                      rows={2}
                      maxLength={3000}
                      value={course.audience ?? ''}
                      onChange={(e) => patch({ audience: e.target.value })}
                    />
                  </Field>
                  <AssetField
                    title="المقطع التعريفي"
                    kind="video"
                    courseId={course.id}
                    value={course.trailer ?? ''}
                    persisted={persisted}
                    request={request}
                    onChange={(trailer) => patch({ trailer })}
                  />
                </EditorSection>
                <EditorSection
                  id="lessons"
                  title="الدروس"
                  summary={
                    course.lessons.length
                      ? `عدد الدروس: ${course.lessons.length}`
                      : 'أضف الدروس ورتّبها'
                  }
                  open={section === 'lessons'}
                  onToggle={setSection}
                >
                  <p>
                    بعد أول تسجيل، تُقفل متطلبات التعلّم حفاظًا على تقدم المتعلمين. أنشئ دورة جديدة
                    لتغييرها.
                  </p>
                  {course.lessons.map((lesson, index) => (
                    <details
                      className="studio-course-lesson"
                      name={`lessons-${course.id}`}
                      key={lesson.id}
                      open={freshLesson === lesson.id}
                    >
                      <summary>
                        <span>
                          {index + 1} / {course.lessons.length}
                        </span>{' '}
                        {lesson.title || 'درس جديد'}
                      </summary>
                      <Field title="اسم الدرس">
                        <input
                          required
                          maxLength={200}
                          value={lesson.title}
                          onChange={(e) =>
                            patch({
                              lessons: course.lessons.map((x) =>
                                x.id === lesson.id ? { ...x, title: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </Field>
                      <CourseTextEditor
                        disabled={busy}
                        key={lesson.id}
                        title="محتوى الدرس"
                        text={lesson.body}
                        document={lesson.bodyDocument}
                        onChange={(body, bodyDocument) =>
                          patch({
                            lessons: course.lessons.map((x) =>
                              x.id === lesson.id ? { ...x, body, bodyDocument } : x,
                            ),
                          })
                        }
                      />
                      <AssetField
                        title="فيديو الدرس"
                        kind="video"
                        courseId={course.id}
                        value={lesson.video}
                        persisted={persisted}
                        request={request}
                        onChange={(video) =>
                          patch({
                            lessons: course.lessons.map((x) =>
                              x.id === lesson.id ? { ...x, video } : x,
                            ),
                          })
                        }
                      />
                      <Field title="مدة الفيديو بالثواني">
                        <input
                          type="number"
                          min={0}
                          max={86400}
                          required
                          value={lesson.durationSeconds}
                          onChange={(e) =>
                            patch({
                              lessons: course.lessons.map((x) =>
                                x.id === lesson.id
                                  ? { ...x, durationSeconds: Number(e.target.value) }
                                  : x,
                              ),
                            })
                          }
                        />
                      </Field>
                      <ResourceEditor
                        courseId={course.id}
                        persisted={persisted}
                        request={request}
                        resources={lesson.resources}
                        onChange={(resources) =>
                          patch({
                            lessons: course.lessons.map((x) =>
                              x.id === lesson.id ? { ...x, resources } : x,
                            ),
                          })
                        }
                      />
                      <AssessmentEditor
                        courseId={course.id}
                        persisted={persisted}
                        request={request}
                        source={lesson}
                        onChange={(change) =>
                          patch({
                            lessons: course.lessons.map((x) =>
                              x.id === lesson.id ? { ...x, ...change } : x,
                            ),
                          })
                        }
                      />
                      <div className="studio-course-actions">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...course.lessons];
                            [next[index - 1], next[index]] = [next[index], next[index - 1]];
                            patch({ lessons: next });
                          }}
                        >
                          نقل للأعلى
                        </button>
                        <button
                          type="button"
                          disabled={index === course.lessons.length - 1}
                          onClick={() => {
                            const next = [...course.lessons];
                            [next[index], next[index + 1]] = [next[index + 1], next[index]];
                            patch({ lessons: next });
                          }}
                        >
                          نقل للأسفل
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            patch({ lessons: course.lessons.filter((x) => x.id !== lesson.id) })
                          }
                        >
                          حذف الدرس
                        </button>
                      </div>
                    </details>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const lesson = newLesson();
                      setFreshLesson(lesson.id);
                      patch({ lessons: [...course.lessons, lesson] });
                    }}
                  >
                    إضافة درس
                  </button>
                </EditorSection>
                <EditorSection
                  id="resources"
                  title="ملفات وتقييمات الدورة"
                  summary="ملفات مشتركة، اختبار نهائي وورقة عمل"
                  open={section === 'resources'}
                  onToggle={setSection}
                >
                  <ResourceEditor
                    courseId={course.id}
                    persisted={persisted}
                    request={request}
                    resources={course.resources}
                    onChange={(resources) => patch({ resources })}
                  />
                  <AssessmentEditor
                    courseId={course.id}
                    persisted={persisted}
                    request={request}
                    source={course}
                    onChange={patch}
                  />
                </EditorSection>
                <EditorSection
                  id="publishing"
                  title="السعر والنشر"
                  summary={`${course.published ? 'منشورة' : 'مسودة'}، ${course.price} ر.س`}
                  open={section === 'publishing'}
                  onToggle={setSection}
                >
                  <div className="studio-course-columns">
                    <Field title="السعر بالريال">
                      <input
                        type="number"
                        min={0}
                        max={100000}
                        step="0.01"
                        required
                        value={course.price}
                        onChange={(e) => patch({ price: Number(e.target.value) })}
                      />
                    </Field>
                    <Field title="حالة النشر">
                      <select
                        value={course.published ? 'published' : 'draft'}
                        onChange={(e) => patch({ published: e.target.value === 'published' })}
                      >
                        <option value="draft">مسودة</option>
                        <option value="published">منشورة</option>
                      </select>
                    </Field>
                  </div>
                </EditorSection>
                <div className="studio-course-savebar">
                  <span>
                    {course.title || 'دورة جديدة'}
                    <small>احفظ التغييرات قبل مغادرة الصفحة.</small>
                  </span>
                  <Button aria-busy={busy} type="submit" className="studio-course-save">
                    {busy ? 'جار الحفظ…' : 'حفظ الدورة'}
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <section>
              <h2>التسجيلات والتقييمات</h2>
              <Button aria-busy={busy} disabled={busy} onClick={() => void loadRoster()}>
                تحديث
              </Button>
              {!roster.length && <p>لا يوجد متعلمون مسجلون بعد.</p>}
              {roster.map((row) => (
                <article className="studio-course-learner" key={row.member}>
                  <h3>{row.name}</h3>
                  <p>
                    {Object.values(row.enrollment.progress).filter((x) => x.complete).length} من{' '}
                    {course.lessonCount} درس مكتمل
                  </p>
                  <p>تسجيل تجريبي: {row.enrollment.order.amount} ر.س</p>
                  <p>{new Date(row.enrollment.order.createdAt).toLocaleDateString('ar-SA')}</p>
                  <p>رقم العملية: {row.enrollment.order.id}</p>
                  <p>
                    {row.enrollment.certificate
                      ? `صدرت الشهادة: ${row.enrollment.certificate.id}`
                      : 'لم تصدر الشهادة'}
                  </p>
                  {row.submissions.map((submission) => (
                    <Grade
                      key={submission.name}
                      courseId={course.id}
                      submission={submission}
                      request={request}
                      onSaved={() => void loadRoster()}
                    />
                  ))}
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
function EditorSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <details className="studio-course-section" data-course-section={id} open={open}>
      <summary
        onClick={(event) => {
          event.preventDefault();
          onToggle(open ? '' : id);
        }}
      >
        <span className="studio-course-section-label">
          <strong>{title}</strong>
          <small>{summary}</small>
        </span>
        <span className="studio-course-section-action" aria-hidden="true">
          {open ? 'إغلاق' : 'تعديل'} <span>{open ? '−' : '+'}</span>
        </span>
      </summary>
      <div className="studio-course-section-body">{children}</div>
    </details>
  );
}
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="studio-course-field">
      <span>{title}</span>
      {children}
    </label>
  );
}
function AssetField({
  title,
  kind = 'resource',
  courseId,
  value,
  onChange,
  persisted,
  request,
}: {
  title: string;
  kind?: 'video' | 'document' | 'resource';
  courseId: string;
  value: string;
  onChange: (value: string) => void;
  persisted: boolean;
  request: Request;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [percent, setPercent] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploadedName, setUploadedName] = useState('');
  const accept =
    kind === 'video' ? '.mp4,.webm' : kind === 'document' ? '.pdf' : '.pdf,.mp4,.webm,.mp3';
  const formats =
    kind === 'video'
      ? 'فيديو MP4 أو WebM'
      : kind === 'document'
        ? 'مستند PDF'
        : 'مستند PDF، فيديو MP4 أو WebM، صوت MP3';
  const choose = (file?: File) => {
    if (!file || busy || !persisted) return;
    setError('');
    if (!accept.split(',').includes(`.${file.name.split('.').pop()?.toLowerCase()}`)) {
      setError(`اختر ملفًا بإحدى الصيغ المدعومة: ${formats}.`);
      return;
    }
    const limit = courseUploadLimit(file.name);
    if (!file.size || !limit || file.size > limit.bytes) {
      setError(`اختر ملفًا غير فارغ، بحجم لا يتجاوز ${limit?.label ?? ''}.`);
      return;
    }
    setSelected(file);
  };
  const latestChange = useRef(onChange);
  latestChange.current = onChange;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const upload = async () => {
    const file = selected;
    if (!file || busy || !persisted) return;
    setError('');
    setBusy(true);
    setPercent(0);
    try {
      const session = await request<{ token: string; chunkSize: number }>(
        `/${courseId}/upload-start`,
        {
          filename: `${uid()}.${file.name.split('.').pop()?.toLowerCase()}`,
          size: file.size,
        },
      );
      for (let offset = 0; offset < file.size; offset += session.chunkSize) {
        if (!mounted.current) return;
        const bytes = new Uint8Array(
          await file.slice(offset, offset + session.chunkSize).arrayBuffer(),
        );
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        await request(`/${courseId}/upload-chunk`, {
          token: session.token,
          offset,
          content: btoa(binary),
        });
        setPercent(Math.round((Math.min(file.size, offset + session.chunkSize) / file.size) * 100));
      }
      const result = await request<{ file: string }>(`/${courseId}/upload-finish`, {
        token: session.token,
      });
      if (mounted.current) {
        latestChange.current(result.file);
        setUploadedName(file.name);
        setSelected(null);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="course-asset" aria-label={title}>
      <div className="course-asset-heading">
        <strong>{title}</strong>
        <span>{value ? 'ملف مرفق' : 'اختياري'}</span>
      </div>
      <div
        className="course-upload-area"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files[0]);
        }}
      >
        <div className="course-upload-copy">
          <strong>
            {selected
              ? selected.name
              : value
                ? uploadedName || 'الملف الحالي جاهز'
                : 'اسحب الملف هنا'}
          </strong>
          <span>
            {selected
              ? `${(selected.size / 1024 / 1024).toFixed(1)} ميجابايت، جاهز للرفع`
              : formats}
          </span>
          <small>
            {kind === 'video'
              ? `الحد الأقصى للفيديو ${COURSE_UPLOAD_LIMITS.mp4.label}`
              : kind === 'document'
                ? `الحد الأقصى ${COURSE_UPLOAD_LIMITS.pdf.label}`
                : `الفيديو ${COURSE_UPLOAD_LIMITS.mp4.label}، الصوت ${COURSE_UPLOAD_LIMITS.mp3.label}، PDF حتى ${COURSE_UPLOAD_LIMITS.pdf.label}`}
          </small>
        </div>
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={accept}
          disabled={!persisted || busy}
          aria-label={`اختيار ملف: ${title}`}
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={!persisted || busy}
          onClick={() => inputRef.current?.click()}
        >
          {selected || value ? 'اختيار ملف آخر' : 'اختيار ملف'}
        </button>
      </div>
      {selected && (
        <div className="course-upload-actions">
          <Button aria-busy={busy} type="button" disabled={busy} onClick={() => void upload()}>
            رفع الملف
          </Button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setSelected(null);
              setError('');
            }}
          >
            إلغاء الاختيار
          </button>
        </div>
      )}
      {busy && selected && <UploadProgress filename={selected.name} bytes={selected.size} percent={percent} />}
      <details className="course-asset-link">
        <summary>استخدام رابط ملف</summary>
        <Field title="رابط الملف">
          <input
            value={value}
            dir="ltr"
            placeholder="https://…"
            disabled={busy}
            onChange={(e) => onChange(e.target.value)}
          />
        </Field>
      </details>

      {!persisted && <p>احفظ المسودة أولًا لرفع الملفات.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function ResourceEditor({
  courseId,
  resources,
  onChange,
  persisted,
  request,
}: {
  courseId: string;
  resources: CourseResource[];
  onChange: (resources: CourseResource[]) => void;
  persisted: boolean;
  request: Request;
}) {
  return (
    <section className="studio-course-resources">
      <h3>ملفات للتنزيل</h3>
      {resources.map((resource) => (
        <div key={resource.id}>
          <Field title="اسم الملف">
            <input
              required
              value={resource.title}
              onChange={(e) =>
                onChange(
                  resources.map((x) =>
                    x.id === resource.id ? { ...x, title: e.target.value } : x,
                  ),
                )
              }
            />
          </Field>
          <AssetField
            title="الملف"
            courseId={courseId}
            value={resource.file}
            onChange={(file) =>
              onChange(resources.map((x) => (x.id === resource.id ? { ...x, file } : x)))
            }
            persisted={persisted}
            request={request}
          />
          <button
            type="button"
            onClick={() => onChange(resources.filter((x) => x.id !== resource.id))}
          >
            حذف الملف
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...resources, { id: uid(), title: '', file: '' }])}
      >
        إضافة ملف
      </button>
    </section>
  );
}
function AssessmentEditor({
  courseId,
  source,
  onChange,
  persisted,
  request,
}: {
  courseId: string;
  source: { quiz?: CourseQuiz; assignment?: CourseAssignment };
  onChange: (change: { quiz?: CourseQuiz; assignment?: CourseAssignment }) => void;
  persisted: boolean;
  request: Request;
}) {
  const quiz = source.quiz;
  const assignment = source.assignment;
  const changeQuiz = (change: Partial<CourseQuiz>) => {
    if (quiz) onChange({ quiz: { ...quiz, ...change } });
  };
  return (
    <section className="studio-course-assessments">
      <h3>الاختبار وورقة العمل</h3>
      {quiz ? (
        <>
          <Field title="عنوان الاختبار">
            <input
              required
              value={quiz.title}
              onChange={(e) => changeQuiz({ title: e.target.value })}
            />
          </Field>
          <div className="studio-course-columns">
            <Field title="درجة الاجتياز ٪">
              <input
                type="number"
                min={1}
                max={100}
                required
                value={quiz.passPercent}
                onChange={(e) => changeQuiz({ passPercent: Number(e.target.value) })}
              />
            </Field>
            <Field title="عدد المحاولات">
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                required
                value={quiz.maxAttempts}
                onChange={(e) => changeQuiz({ maxAttempts: Number(e.target.value) })}
              />
            </Field>
          </div>
          {quiz.questions.map((question, index) => (
            <fieldset key={question.id}>
              <legend>السؤال {index + 1}</legend>
              <Field title="نص السؤال">
                <textarea
                  required
                  value={question.prompt}
                  onChange={(e) =>
                    changeQuiz({
                      questions: quiz.questions.map((q) =>
                        q.id === question.id ? { ...q, prompt: e.target.value } : q,
                      ),
                    })
                  }
                />
              </Field>
              {question.options.map((option, i) => (
                <Field key={i} title={`الخيار ${i + 1}`}>
                  <input
                    required
                    value={option}
                    onChange={(e) =>
                      changeQuiz({
                        questions: quiz.questions.map((q) =>
                          q.id === question.id
                            ? {
                                ...q,
                                options: q.options.map((o, n) => (n === i ? e.target.value : o)),
                              }
                            : q,
                        ),
                      })
                    }
                  />
                </Field>
              ))}
              <Field title="الإجابة الصحيحة">
                <select
                  value={question.correct ?? 0}
                  onChange={(e) =>
                    changeQuiz({
                      questions: quiz.questions.map((q) =>
                        q.id === question.id ? { ...q, correct: Number(e.target.value) } : q,
                      ),
                    })
                  }
                >
                  {question.options.map((_, i) => (
                    <option key={i} value={i}>
                      الخيار {i + 1}
                    </option>
                  ))}
                </select>
              </Field>
              <button
                type="button"
                onClick={() =>
                  changeQuiz({ questions: quiz.questions.filter((q) => q.id !== question.id) })
                }
              >
                حذف السؤال
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              changeQuiz({
                questions: [
                  ...quiz.questions,
                  { id: uid(), prompt: '', options: ['', '', '', ''], correct: 0 },
                ],
              })
            }
          >
            إضافة سؤال
          </button>
          <button type="button" onClick={() => onChange({ quiz: undefined })}>
            حذف الاختبار
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() =>
            onChange({
              quiz: { id: uid(), title: '', passPercent: 70, maxAttempts: 3, questions: [] },
            })
          }
        >
          إضافة اختبار
        </button>
      )}
      {assignment ? (
        <>
          <Field title="عنوان ورقة العمل">
            <input
              required
              value={assignment.title}
              onChange={(e) => onChange({ assignment: { ...assignment, title: e.target.value } })}
            />
          </Field>
          <Field title="تعليمات الحل">
            <textarea
              value={assignment.instructions}
              onChange={(e) =>
                onChange({ assignment: { ...assignment, instructions: e.target.value } })
              }
            />
          </Field>
          <AssetField
            title="ملف ورقة العمل"
            kind="document"
            courseId={courseId}
            value={assignment.file}
            onChange={(file) => onChange({ assignment: { ...assignment, file } })}
            persisted={persisted}
            request={request}
          />
          <label>
            <input
              type="checkbox"
              checked={assignment.required}
              onChange={(e) =>
                onChange({ assignment: { ...assignment, required: e.target.checked } })
              }
            />
            اجتيازها مطلوب للشهادة
          </label>
          <button type="button" onClick={() => onChange({ assignment: undefined })}>
            حذف ورقة العمل
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() =>
            onChange({
              assignment: { id: uid(), title: '', instructions: '', required: true, file: '' },
            })
          }
        >
          إضافة ورقة عمل للتقييم
        </button>
      )}
    </section>
  );
}
function Grade({
  courseId,
  submission,
  request,
  onSaved,
}: {
  courseId: string;
  submission: Roster['submissions'][number];
  request: Request;
  onSaved: () => void;
}) {
  const [comments, setComments] = useState(submission.comments);
  const [status, setStatus] = useState(submission.status === 'Fail' ? 'Fail' : 'Pass');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        setNotice('');
        try {
          await request(`/${courseId}/grade`, { submissionId: submission.name, status, comments });
          setNotice('حُفظ التقييم.');
          onSaved();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h4>{submission.assignment_title}</h4>
      <p className="studio-course-answer">
        {submission.answer.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')}
      </p>
      <Field title="التقييم">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="Pass">مجتازة</option>
          <option value="Fail">تحتاج إلى تعديل</option>
        </select>
      </Field>
      <Field title="ملاحظات للمتعلم">
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} />
      </Field>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <Button aria-busy={busy} disabled={busy}>
        {busy ? 'جار الحفظ…' : 'حفظ التقييم'}
      </Button>
    </form>
  );
}

function CourseTextEditor({
  disabled,
  title,
  text,
  document,
  onChange,
}: {
  disabled?: boolean;
  title: string;
  text: string;
  document?: RichTextDocument;
  onChange: (text: string, document: RichTextDocument) => void;
}) {
  return (
    <div className="studio-course-field studio-course-rich-field">
      <span>{title}</span>
      <RichTextEditor
        label={title}
        disabled={disabled}
        textOnly
        initialDocument={
          document ?? {
            type: 'doc',
            content: text.split('\n').map((line) => ({
              type: 'paragraph',
              content: line ? [{ type: 'text', text: line }] : [],
            })),
          }
        }
        onChange={(value) => onChange(value.text, richTextDocumentSchema.parse(value.document))}
      />
    </div>
  );
}
