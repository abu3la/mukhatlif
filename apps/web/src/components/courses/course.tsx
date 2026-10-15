'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
import { CourseVideo } from './player';
import './courses.css';

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
  return (
    <div className="page courses-page">
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
            <p>{detail.description}</p>
            <span>
              {detail.instructor} · {detail.lessonCount} درس · {detail.durationMinutes} دقيقة
            </span>
          </header>
          {error && (
            <p role="alert" className="course-error">
              {error}
            </p>
          )}
          {notice && <p role="status">{notice}</p>}
          {!workspace ? (
            <div className="course-intro">
              <section>
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
                    سجّل في الدورة
                  </button>
                )}
              </section>
            </div>
          ) : (
            <>
              <div className="course-workspace">
                <aside>
                  <h2>دروس الدورة</h2>
                  <ol className="course-lessons">
                    {course!.lessons.map((item, index) => (
                      <li key={item.id}>
                        <button
                          aria-current={item.id === selected ? 'step' : undefined}
                          onClick={() => setSelected(item.id)}
                        >
                          <span>
                            {index + 1}. {item.title}
                          </span>
                          <small>
                            {workspace.enrollment.progress[item.id]?.complete
                              ? 'مكتمل'
                              : 'لم يكتمل'}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ol>
                  <p>
                    {Object.values(workspace.enrollment.progress).filter((x) => x.complete).length}{' '}
                    من {course!.lessonCount} درس مكتمل
                  </p>
                </aside>
                <section className="course-lesson" key={selected}>
                  {lesson && (
                    <>
                      <h2>{lesson.title}</h2>
                      {lesson.video && (
                        <CourseVideo
                          courseId={courseId}
                          lesson={lesson}
                          initialPosition={workspace.enrollment.progress[lesson.id]?.position ?? 0}
                          onSaved={save}
                        />
                      )}
                      <div className="course-prose">{lesson.body}</div>
                      {!lesson.video && (
                        <button
                          className="course-button"
                          disabled={busy || workspace.enrollment.progress[lesson.id]?.complete}
                          onClick={() =>
                            act(
                              'progress',
                              { lessonId: lesson.id, position: 0, read: true },
                              'اكتمل الدرس.',
                            )
                          }
                        >
                          {workspace.enrollment.progress[lesson.id]?.complete
                            ? 'الدرس مكتمل'
                            : 'أكملت قراءة الدرس'}
                        </button>
                      )}
                      <Resources courseId={courseId} resources={lesson.resources} />
                      <Assessment
                        courseId={courseId}
                        source={lesson}
                        enrollment={workspace.enrollment}
                        onSaved={save}
                      />
                    </>
                  )}
                </section>
              </div>
              <section className="course-materials">
                <h2>ملفات الدورة وتقييمها</h2>
                <Resources courseId={courseId} resources={course!.resources} />
                <Assessment
                  courseId={courseId}
                  source={course!}
                  enrollment={workspace.enrollment}
                  onSaved={save}
                />
                {!course!.resources.length && !course!.quiz && !course!.assignment && (
                  <p>لا توجد ملفات أو تقييمات إضافية لهذه الدورة.</p>
                )}
              </section>
              <section className="course-completion">
                <h2>شهادة الإكمال</h2>
                <p>أكمل الدروس واجتز الاختبارات وأوراق العمل المطلوبة للحصول على شهادتك.</p>
                {workspace.enrollment.certificate ? (
                  <>
                    <div className="course-certificate">
                      <img src="/handoff/mukhtalif-logo.svg" alt="مختلف" width="160" height="54" />
                      <h2>شهادة إكمال</h2>
                      <p>تشهد مختلف بأن</p>
                      <h3>{workspace.enrollment.certificate.member}</h3>
                      <p>أكمل دورة «{course!.title}» ومتطلباتها.</p>
                      <p>{workspace.enrollment.certificate.issuedAt}</p>
                      <small>رقم الشهادة: {workspace.enrollment.certificate.id}</small>
                    </div>
                    <button className="course-button" onClick={() => window.print()}>
                      طباعة الشهادة أو حفظها PDF
                    </button>
                  </>
                ) : (
                  <button
                    className="course-button"
                    disabled={busy}
                    onClick={() => act('certificate', {}, 'صدرت شهادة الإكمال.')}
                  >
                    إصدار الشهادة
                  </button>
                )}
              </section>
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
        درجة الاجتياز: {quiz.passPercent}٪ · المحاولات المتبقية:{' '}
        {quiz.maxAttempts - (state?.attempts ?? 0)}
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
        {busy ? 'جارٍ الإرسال…' : state ? 'إعادة إرسال الحل' : 'إرسال الحل للتقييم'}
      </button>
    </form>
  );
}
