'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  CourseDefinition,
  CourseEnrollment,
  CourseQuiz,
  CourseAssignment,
  CourseResource,
  CourseWorkspace,
} from '@mukhtalif/types';
import { useCustomer } from '../customer-provider';
import { useCoursesApi, CourseApiError } from './api';
import { BrandIcon } from '../brand-icon';
import { CourseVideo } from './player';
import './courses.css';

const sectionIcons = {
  lesson: 'play',
  content: 'play',
  materials: 'library',
  files: 'library',
  quiz: 'check',
  assignment: 'document',
  certificate: 'certificate',
} as const;

type Detail = Omit<CourseDefinition, 'lessons' | 'resources'> & {
  lessons: { id: string; title: string; durationSeconds: number }[];
};
export function CoursePage({ courseId }: { courseId: string }) {
  const customer = useCustomer();
  // Remount private state on identity changes, including sign-out.
  return <CourseContent key={`${courseId}:${customer.user?.id ?? 'guest'}`} courseId={courseId} />;
}
function CourseContent({ courseId }: { courseId: string }) {
  const api = useCoursesApi();
  const customer = useCustomer();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [workspace, setWorkspace] = useState<CourseWorkspace | null>(null);
  const [selected, setSelected] = useState('');
  const [view, setView] = useState('lesson');
  const [lessonView, setLessonView] = useState('content');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    (async () => {
      const course = await api<Detail>(`/courses/${courseId}`, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setDetail(course);
      if (customer.user) {
        try {
          const result = await api<CourseWorkspace>(
            `/app/courses/${courseId}`,
            undefined,
            controller.signal,
          );
          if (!controller.signal.aborted) {
            setWorkspace(result);
            setSelected(result.enrollment.lastLesson || result.course.lessons[0]?.id || '');
          }
        } catch (e) {
          if (!(e instanceof CourseApiError && e.status === 403)) throw e;
        }
      }
    })()
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, courseId, customer.user, retry]);
  const save = (enrollment: CourseEnrollment) =>
    setWorkspace((old) => (old ? { ...old, enrollment } : old));
  const act = async (action: string, body: unknown, message?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<CourseEnrollment>(`/app/courses/${courseId}/${action}`, body);
      save(result);
      if (message) setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const enroll = async (outcome: 'success' | 'declined') => {
    if (await act('checkout', { mode: 'simulation', outcome })) {
      setCheckout(false);
      setRetry(retry + 1);
      setNotice('اكتمل التسجيل التجريبي. لم يُخصم أي مبلغ.');
    }
  };
  const lesson = workspace?.course.lessons.find((item) => item.id === selected);
  const course = workspace?.course;
  const lessonIndex = course?.lessons.findIndex((item) => item.id === selected) ?? -1;
  const [reading, setReading] = useState<Record<string, number>>({});
  const openLesson = (id: string) => {
    setSelected(id);
    setView('lesson');
    setLessonView('content');
  };
  const certificateReady =
    !!course &&
    !!workspace &&
    course.lessons.every((item) => workspace.enrollment.progress[item.id]?.complete) &&
    [course, ...course.lessons].every(
      (item) =>
        (!item.quiz || workspace.enrollment.quizzes[item.quiz.id]?.passed) &&
        (!item.assignment?.required ||
          workspace.enrollment.assignments[item.assignment.id]?.status === 'Pass'),
    );

  const percentFor = (item: CourseDefinition['lessons'][number]) => {
    const progress = workspace?.enrollment.progress[item.id];
    return progress?.complete
      ? 100
      : item.video
        ? Math.min(
            100,
            Math.round(((progress?.watched ?? 0) / Math.max(1, item.durationSeconds)) * 100),
          )
        : Math.max(reading[item.id] ?? 0, progress?.readPercent ?? 0);
  };
  return (
    <div className={`page courses-page ${workspace ? 'course-learning-page' : ''}`}>
      <Link href="/courses">الدورات</Link>
      {loading ? (
        <p role="status">جارٍ تحميل الدورة…</p>
      ) : !detail ? (
        <>
          <p role="alert">{error || 'الدورة غير موجودة.'}</p>
          <button onClick={() => setRetry(retry + 1)}>حاول مجددًا</button>
        </>
      ) : (
        <>
          <header className="courses-heading">
            <h1>{detail.title}</h1>
            {!workspace && <p>{detail.description}</p>}
            <div className="course-facts">
              {detail.instructor && (
                <span>
                  <BrandIcon name="user" />
                  {detail.instructor}
                </span>
              )}
              <span>
                <BrandIcon name="queue" />
                {detail.lessonCount} درس
              </span>
              {detail.durationMinutes > 0 && (
                <span>
                  <BrandIcon name="clock" />
                  {detail.durationMinutes} دقيقة
                </span>
              )}
            </div>
          </header>
          {error && (
            <p role="alert" className="course-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {!workspace ? (
            <div className="course-intro">
              <section className="course-overview">
                {detail.hasTrailer && <CourseTrailer courseId={courseId} />}
                <h2>عن الدورة</h2>
                <p className="course-prose">{detail.overview || detail.description}</p>
                {detail.audience && (
                  <>
                    <h2>لمن هذه الدورة؟</h2>
                    <p className="course-prose">{detail.audience}</p>
                  </>
                )}
                <h2>محتوى الدورة</h2>
                <ol className="course-curriculum">
                  {detail.lessons.map((item) => (
                    <li key={item.id}>
                      <span>{item.title}</span>
                      <small>{Math.ceil(item.durationSeconds / 60)} دقيقة</small>
                    </li>
                  ))}
                </ol>
              </section>
              <section className="course-checkout">
                <h2>{detail.price ? `${detail.price} ر.س` : 'دورة مجانية'}</h2>
                <div className="course-purchase-facts">
                  <span>
                    <BrandIcon name="queue" />
                    {detail.lessonCount} درس
                  </span>
                  {detail.level && (
                    <span>
                      <BrandIcon name="level" />
                      {detail.level}
                    </span>
                  )}
                  {detail.instructor && (
                    <span>
                      <BrandIcon name="user" />
                      {detail.instructor}
                    </span>
                  )}
                </div>
                <p>التسجيل حاليًا بمحاكاة دفع. لن نطلب بطاقة ولن نخصم أي مبلغ.</p>
                {checkout ? (
                  <>
                    <h3>محاكاة الدفع</h3>
                    <p>اختر نتيجة العملية لتجربة التسجيل.</p>
                    <button
                      className="course-button"
                      disabled={busy}
                      onClick={() => enroll('success')}
                    >
                      محاكاة دفع ناجح والتسجيل
                    </button>
                    <button disabled={busy} onClick={() => enroll('declined')}>
                      محاكاة رفض الدفع
                    </button>
                    <button disabled={busy} onClick={() => setCheckout(false)}>
                      إلغاء
                    </button>
                  </>
                ) : (
                  <button
                    className="course-button"
                    onClick={() => {
                      if (customer.requireAccount()) setCheckout(true);
                    }}
                  >
                    <BrandIcon name="next" />
                    المتابعة للتسجيل
                  </button>
                )}
              </section>
            </div>
          ) : (
            <>
              <nav className="course-view-nav" aria-label="أقسام الدورة">
                {[
                  ['lesson', 'التعلّم'],
                  ...(course!.resources.length ? [['materials', 'ملفات الدورة']] : []),
                  ...(course!.quiz ? [['quiz', 'اختبار الدورة']] : []),
                  ...(course!.assignment ? [['assignment', 'ورقة عمل الدورة']] : []),
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-current={view === id ? 'page' : undefined}
                    onClick={() => setView(id)}
                  >
                    <BrandIcon name={sectionIcons[id as keyof typeof sectionIcons]} />
                    {label}
                  </button>
                ))}
              </nav>
              {view === 'lesson' && (
                <div className="course-workspace">
                  <aside>
                    <div className="course-outline">
                      <h2>دروس الدورة ({course!.lessons.length})</h2>
                      <ol className="course-lessons">
                        {course!.lessons.map((item, index) => (
                          <li key={item.id}>
                            <button
                              aria-current={item.id === selected ? 'step' : undefined}
                              onClick={() => openLesson(item.id)}
                            >
                              <span className="course-lesson-name">
                                <LessonRing
                                  value={percentFor(item)}
                                  complete={!!workspace.enrollment.progress[item.id]?.complete}
                                />
                                {index + 1}. {item.title}
                              </span>
                              <span className="course-lesson-meta">
                                {item.id === selected && <small>الدرس الحالي</small>}
                                {workspace.enrollment.progress[item.id]?.complete ? (
                                  <CompletionChip />
                                ) : (
                                  item.id !== selected && <small>لم يكتمل</small>
                                )}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <label className="course-lesson-picker">
                      انتقل إلى درس
                      <select value={selected} onChange={(event) => openLesson(event.target.value)}>
                        {course!.lessons.map((item, index) => (
                          <option key={item.id} value={item.id}>
                            {index + 1}. {item.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="course-certificate-entry"
                      onClick={() => setView('certificate')}
                    >
                      <BrandIcon name="certificate" />
                      <span>
                        <strong>شهادة الإكمال</strong>
                        <small>
                          {workspace.enrollment.certificate
                            ? 'شهادتك جاهزة للعرض'
                            : certificateReady
                              ? 'أكملت المتطلبات، أصدر شهادتك'
                              : 'محطتك الأخيرة بعد إكمال المتطلبات'}
                        </small>
                      </span>
                      <BrandIcon name="next" />
                    </button>
                  </aside>
                  <section className="course-lesson" key={selected}>
                    {lesson && (
                      <>
                        <div className="course-lesson-heading">
                          <h2 className="course-lesson-name">
                            <LessonRing
                              value={percentFor(lesson)}
                              complete={!!workspace.enrollment.progress[lesson.id]?.complete}
                            />
                            {lesson.title}
                          </h2>
                          <span dir="ltr">
                            {lessonIndex + 1}/{course!.lessons.length}
                          </span>
                          {workspace.enrollment.progress[lesson.id]?.complete ? (
                            <CompletionChip />
                          ) : (
                            <span>لم يكتمل بعد</span>
                          )}
                        </div>
                        {(lesson.resources.length > 0 || lesson.quiz || lesson.assignment) && (
                          <nav
                            className="course-view-nav course-lesson-nav"
                            aria-label="أقسام الدرس"
                          >
                            {[
                              ['content', 'الدرس'],
                              ...(lesson.resources.length ? [['files', 'ملفات الدرس']] : []),
                              ...(lesson.quiz ? [['quiz', 'اختبار الدرس']] : []),
                              ...(lesson.assignment ? [['assignment', 'ورقة العمل']] : []),
                            ].map(([id, label]) => (
                              <button
                                key={id}
                                aria-current={lessonView === id ? 'page' : undefined}
                                onClick={() => setLessonView(id)}
                              >
                                <BrandIcon name={sectionIcons[id as keyof typeof sectionIcons]} />
                                {label}
                              </button>
                            ))}
                          </nav>
                        )}
                        <div
                          className="course-lesson-body"
                          key={lessonView}
                          tabIndex={0}
                          aria-label="محتوى الدرس"
                        >
                          {lessonView === 'content' && (
                            <>
                              {lesson.video && (
                                <CourseVideo
                                  courseId={courseId}
                                  lesson={lesson}
                                  initialPosition={
                                    workspace.enrollment.progress[lesson.id]?.position ?? 0
                                  }
                                  onSaved={save}
                                />
                              )}
                              {lesson.video ? (
                                <div className="course-prose">{lesson.body}</div>
                              ) : (
                                <LessonReading
                                  courseId={courseId}
                                  lessonId={lesson.id}
                                  body={lesson.body}
                                  initialPercent={
                                    workspace.enrollment.progress[lesson.id]?.readPercent ?? 0
                                  }
                                  complete={!!workspace.enrollment.progress[lesson.id]?.complete}
                                  onProgress={(percent) =>
                                    setReading((old) => ({ ...old, [lesson.id]: percent }))
                                  }
                                  onSaved={save}
                                />
                              )}
                            </>
                          )}
                          {lessonView === 'files' && (
                            <Resources courseId={courseId} resources={lesson.resources} />
                          )}
                          {lessonView === 'quiz' && (
                            <Assessment
                              courseId={courseId}
                              source={{ quiz: lesson.quiz }}
                              enrollment={workspace.enrollment}
                              onSaved={save}
                            />
                          )}
                          {lessonView === 'assignment' && (
                            <Assessment
                              courseId={courseId}
                              source={{ assignment: lesson.assignment }}
                              enrollment={workspace.enrollment}
                              onSaved={save}
                            />
                          )}
                        </div>
                        <nav className="course-step-nav" aria-label="التنقل بين الدروس">
                          <button
                            disabled={lessonIndex <= 0}
                            onClick={() => openLesson(course!.lessons[lessonIndex - 1].id)}
                          >
                            <BrandIcon name="previous" />
                            الدرس السابق
                          </button>
                          <span dir="ltr">
                            {lessonIndex + 1} / {course!.lessons.length}
                          </span>
                          <button
                            disabled={lessonIndex >= course!.lessons.length - 1}
                            onClick={() => openLesson(course!.lessons[lessonIndex + 1].id)}
                          >
                            الدرس التالي
                            <BrandIcon name="next" />
                          </button>
                        </nav>
                      </>
                    )}
                  </section>
                </div>
              )}
              {view === 'materials' && (
                <section className="course-materials">
                  <h2>ملفات الدورة</h2>
                  <Resources courseId={courseId} resources={course!.resources} />
                  {!course!.resources.length && <p>لا توجد ملفات إضافية لهذه الدورة.</p>}
                </section>
              )}
              {view === 'quiz' && (
                <Assessment
                  courseId={courseId}
                  source={{ quiz: course!.quiz }}
                  enrollment={workspace.enrollment}
                  onSaved={save}
                />
              )}
              {view === 'assignment' && (
                <Assessment
                  courseId={courseId}
                  source={{ assignment: course!.assignment }}
                  enrollment={workspace.enrollment}
                  onSaved={save}
                />
              )}
              {view === 'certificate' && (
                <section className="course-completion">
                  <header className="course-certificate-heading">
                    <BrandIcon name="certificate" />
                    <div>
                      <h2>شهادة الإكمال</h2>
                      <p>
                        {workspace.enrollment.certificate
                          ? 'أتممت متطلبات الدورة. شهادتك جاهزة للحفظ والمشاركة.'
                          : certificateReady
                            ? 'أكملت جميع المتطلبات. يمكنك إصدار شهادتك الآن.'
                            : 'أكمل المتطلبات التالية للحصول على شهادتك.'}
                      </p>
                    </div>
                    {(certificateReady || workspace.enrollment.certificate) && <CompletionChip />}
                  </header>
                  {!workspace.enrollment.certificate && (
                    <ul className="course-certificate-requirements">
                      {course!.lessons.map((item) => (
                        <li key={item.id}>
                          <span>{item.title}</span>
                          {workspace.enrollment.progress[item.id]?.complete ? (
                            <CompletionChip />
                          ) : (
                            <button className="course-control" onClick={() => openLesson(item.id)}>
                              متابعة الدرس
                              <BrandIcon name="next" />
                            </button>
                          )}
                        </li>
                      ))}
                      {[course!, ...course!.lessons].flatMap((item) => [
                        ...(item.quiz
                          ? [
                              <li key={item.quiz.id}>
                                <span>{item.quiz.title}</span>
                                {workspace.enrollment.quizzes[item.quiz.id]?.passed ? (
                                  <CompletionChip />
                                ) : (
                                  <span>اجتياز الاختبار مطلوب</span>
                                )}
                              </li>,
                            ]
                          : []),
                        ...(item.assignment?.required
                          ? [
                              <li key={item.assignment.id}>
                                <span>{item.assignment.title}</span>
                                {workspace.enrollment.assignments[item.assignment.id]?.status ===
                                'Pass' ? (
                                  <CompletionChip />
                                ) : (
                                  <span>اعتماد ورقة العمل مطلوب</span>
                                )}
                              </li>,
                            ]
                          : []),
                      ])}
                    </ul>
                  )}
                  {workspace.enrollment.certificate ? (
                    <>
                      <div className="course-certificate">
                        <img
                          src="/handoff/mukhtalif-logo.svg"
                          alt="مختلف"
                          width="160"
                          height="54"
                        />
                        <h2>شهادة إكمال</h2>
                        <p>تشهد مختلف بأن</p>
                        <h3>{workspace.enrollment.certificate.member}</h3>
                        <p>أكمل دورة «{course!.title}» ومتطلباتها.</p>
                        <p>{workspace.enrollment.certificate.issuedAt}</p>
                        <small>رقم الشهادة: {workspace.enrollment.certificate.id}</small>
                      </div>
                      <button className="course-button" onClick={() => window.print()}>
                        <BrandIcon name="document" />
                        طباعة الشهادة أو حفظها PDF
                      </button>
                    </>
                  ) : (
                    <button
                      className="course-button"
                      disabled={busy || !certificateReady}
                      onClick={() => act('certificate', {}, 'صدرت شهادة الإكمال.')}
                    >
                      <BrandIcon name="certificate" />
                      إصدار الشهادة
                    </button>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
function Resources({ courseId, resources }: { courseId: string; resources: CourseResource[] }) {
  const api = useCoursesApi();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const download = async (resource: CourseResource) => {
    setBusy(resource.id);
    setError('');
    try {
      const result = await api<{ url: string }>(`/app/courses/${courseId}/asset`, {
        file: resource.file,
      });
      const link = document.createElement('a');
      link.href = result.url;
      link.rel = 'noreferrer';
      link.download = resource.title;
      link.click();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      {resources.length > 0 && (
        <ul className="course-resources">
          {resources.map((resource) => (
            <li key={resource.id}>
              <button disabled={Boolean(busy)} onClick={() => download(resource)}>
                {busy === resource.id ? 'جارٍ تجهيز الملف…' : `تنزيل ${resource.title}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}
function Assessment({
  courseId,
  source,
  enrollment,
  onSaved,
}: {
  courseId: string;
  source: { quiz?: CourseQuiz; assignment?: CourseAssignment };
  enrollment: CourseEnrollment;
  onSaved: (state: CourseEnrollment) => void;
}) {
  return (
    <>
      {source.quiz && (
        <Quiz
          key={source.quiz.id}
          courseId={courseId}
          quiz={source.quiz}
          state={enrollment.quizzes[source.quiz.id]}
          onSaved={onSaved}
        />
      )}
      {source.assignment && (
        <Assignment
          key={source.assignment.id}
          courseId={courseId}
          assignment={source.assignment}
          state={enrollment.assignments[source.assignment.id]}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
function Quiz({
  courseId,
  quiz,
  state,
  onSaved,
}: {
  courseId: string;
  quiz: CourseQuiz;
  state?: CourseEnrollment['quizzes'][string];
  onSaved: (state: CourseEnrollment) => void;
}) {
  const api = useCoursesApi();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="course-assessment"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onSaved(
            await api<CourseEnrollment>(`/app/courses/${courseId}/quiz`, {
              quizId: quiz.id,
              answers,
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{quiz.title}</h3>
      <p>
        درجة الاجتياز: {quiz.passPercent}٪ <br />
        المحاولات المتبقية: {quiz.maxAttempts - (state?.attempts ?? 0)}
      </p>
      {quiz.questions.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.prompt}</legend>
          {q.options.map((option, index) => (
            <label key={index}>
              <input
                required
                type="radio"
                name={q.id}
                checked={answers[q.id] === index}
                onChange={() => setAnswers({ ...answers, [q.id]: index })}
              />
              {option}
            </label>
          ))}
        </fieldset>
      ))}
      {state && (
        <p role="status">
          {state.passed ? 'اجتزت الاختبار.' : 'لم تجتز الاختبار بعد.'} نتيجة آخر محاولة:{' '}
          {Math.round(state.percentage)}٪
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="course-button"
        disabled={busy || (state?.attempts ?? 0) >= quiz.maxAttempts}
      >
        <BrandIcon name="check" />
        {busy ? 'جارٍ التصحيح…' : 'إرسال الإجابات'}
      </button>
    </form>
  );
}
function Assignment({
  courseId,
  assignment,
  state,
  onSaved,
}: {
  courseId: string;
  assignment: CourseAssignment;
  state?: CourseEnrollment['assignments'][string];
  onSaved: (state: CourseEnrollment) => void;
}) {
  const api = useCoursesApi();
  const [answer, setAnswer] = useState(state?.answer ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const statuses: Record<string, string> = {
    Pass: 'مجتازة',
    Fail: 'تحتاج إلى تعديل',
    'Not Graded': 'بانتظار التقييم',
  };
  return (
    <form
      className="course-assessment"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          onSaved(
            await api<CourseEnrollment>(`/app/courses/${courseId}/assignment`, {
              assignmentId: assignment.id,
              answer,
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{assignment.title}</h3>
      <p>{assignment.required ? 'مطلوبة لإصدار الشهادة' : 'تطبيق اختياري'}</p>
      <p className="course-prose">{assignment.instructions}</p>
      {assignment.file && (
        <Resources
          courseId={courseId}
          resources={[{ id: assignment.id, title: 'ورقة العمل', file: assignment.file }]}
        />
      )}
      <label>
        إجابتك
        <textarea
          required
          maxLength={20000}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={6}
          disabled={state?.status === 'Pass'}
        />
      </label>
      {state && (
        <p role="status">
          {statuses[state.status] ?? state.status}
          {state.comments && `: ${state.comments}`}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button className="course-button" disabled={busy || state?.status === 'Pass'}>
        <BrandIcon name="document" />
        {busy ? 'جارٍ الإرسال…' : state ? 'إعادة إرسال الحل' : 'إرسال الحل للتقييم'}
      </button>
    </form>
  );
}

function CompletionChip() {
  return (
    <span className="course-complete-chip">
      <BrandIcon name="check" />
      مكتمل
    </span>
  );
}
function LessonRing({ value, complete = false }: { value: number; complete?: boolean }) {
  const percent = complete ? 100 : Math.max(0, Math.min(99, Math.round(value)));
  return (
    <svg
      className={`lesson-ring ${complete ? 'is-complete' : ''}`}
      viewBox="0 0 36 36"
      role="img"
      aria-label={complete ? 'الدرس مكتمل' : `تقدم الدرس ${percent}٪`}
    >
      <circle className="lesson-ring-track" cx="18" cy="18" r="15" />
      <circle
        className="lesson-ring-fill"
        cx="18"
        cy="18"
        r="15"
        pathLength="100"
        strokeDasharray={`${percent} 100`}
        transform="rotate(-90 18 18)"
      />
      {complete ? (
        <path
          d="m11 18 5 5 9-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <text x="18" y="18" textAnchor="middle" dominantBaseline="central">
          {percent}
        </text>
      )}
    </svg>
  );
}

function LessonReading({
  courseId,
  lessonId,
  body,
  initialPercent,
  complete,
  onProgress,
  onSaved,
}: {
  courseId: string;
  lessonId: string;
  body: string;
  initialPercent: number;
  complete: boolean;
  onProgress: (percent: number) => void;
  onSaved: (state: CourseEnrollment) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onProgress, onSaved });
  callbacks.current = { onProgress, onSaved };
  const api = useCoursesApi();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const node = element.current;
    const pane = node?.parentElement;
    if (!node || !pane || complete) return;
    let best = initialPercent;
    let sent = initialPercent;
    let active = true;
    let visible = false;
    let timer: ReturnType<typeof setTimeout>;
    let chain = Promise.resolve();
    const saveProgress = () => {
      if (best <= sent) return;
      const value = best;
      sent = value;
      chain = chain
        .then(async () => {
          const state = await api<CourseEnrollment>(`/app/courses/${courseId}/progress`, {
            lessonId,
            position: 0,
            readPercent: value,
          });
          if (active) {
            callbacks.current.onSaved(state);
            setError('');
          }
        })
        .catch((e) => {
          sent = initialPercent;
          if (active) setError(e.message);
        });
    };
    const measure = () => {
      if (!visible || document.visibilityState !== 'visible') return;
      const percent = Math.min(
        100,
        Math.floor(((pane.scrollTop + pane.clientHeight) / Math.max(1, pane.scrollHeight)) * 100),
      );
      best = Math.max(best, percent);
      callbacks.current.onProgress(best);
      clearTimeout(timer);
      timer = setTimeout(saveProgress, 500);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          clearTimeout(timer);
          timer = setTimeout(measure, 1800);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(pane);
    pane.addEventListener('scroll', measure, { passive: true });
    document.addEventListener('visibilitychange', measure);
    return () => {
      active = false;
      clearTimeout(timer);
      observer.disconnect();
      pane.removeEventListener('scroll', measure);
      document.removeEventListener('visibilitychange', measure);
      saveProgress();
    };
  }, [api, courseId, lessonId, initialPercent, complete, retry]);
  return (
    <div ref={element}>
      <div className="course-prose">{body}</div>
      <p className="course-reading-status" role="status">
        {complete ? 'اكتملت القراءة' : 'يُحفظ تقدم القراءة تلقائيًا عند التمرير.'}
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="course-button" onClick={() => setRetry(retry + 1)}>
            أعد حفظ التقدم
          </button>
        </div>
      )}
    </div>
  );
}

function CourseTrailer({ courseId }: { courseId: string }) {
  const api = useCoursesApi();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    api<{ url: string }>(`/courses/${courseId}/trailer`, undefined, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setUrl(result.url);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [api, courseId, retry]);
  return (
    <section className="course-trailer" aria-label="المقطع التعريفي">
      <h2>شاهد مقدمة الدورة</h2>
      {url && !error ? (
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          aria-label="المقطع التعريفي للدورة"
          onError={() => setError('تعذّر تشغيل المقطع التعريفي.')}
        />
      ) : (
        !error && <p role="status">جارٍ تحميل المقطع التعريفي…</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button className="course-button" onClick={() => setRetry(retry + 1)}>
            حاول مجددًا
          </button>
        </div>
      )}
    </section>
  );
}
