import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import { isAdminRepositoryError } from '@/data';
import {
  Button,
  Field,
  Input,
  PageBreadcrumb,
  PageHeader,
  PremiumMark,
  Switch,
  Textarea,
} from '@/shared/ui/primitives';
import { formatArabicInteger } from '@/lib';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function showSaveErrorMessage(error: unknown): string {
  if (!isAdminRepositoryError(error)) {
    return 'تعذّر حفظ البرنامج. حاول مرة أخرى.';
  }

  switch (error.code) {
    case 'CONFLICT':
      return 'هذا المعرّف مستخدم. اختر معرّفًا آخر.';
    case 'UNAUTHENTICATED':
      return 'انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى.';
    case 'FORBIDDEN':
      return 'ليس لديك صلاحية لإضافة برنامج.';
    case 'NETWORK':
    case 'REMOTE_UNAVAILABLE':
      return 'تعذّر الاتصال بالخادم. تحقق من اتصالك ثم حاول مرة أخرى.';
    default:
      return 'تعذّر حفظ البرنامج. راجع البيانات ثم حاول مرة أخرى.';
  }
}

function homepageSettingsErrorMessage(error: unknown): string {
  if (isAdminRepositoryError(error)) {
    if (error.code === 'CONFLICT') {
      return 'تغيّرت إعدادات القسم في جلسة أخرى. راجعها وحاول مجددًا.';
    }
    if (error.code === 'UNAUTHENTICATED') {
      return 'انتهت جلسة الدخول. سجّل الدخول ثم حاول مرة أخرى.';
    }
    if (error.code === 'FORBIDDEN') return 'ليس لديك صلاحية لتعديل القسم.';
    if (error.code === 'NETWORK' || error.code === 'REMOTE_UNAVAILABLE') {
      return 'تعذّر الاتصال بالخادم. حاول مرة أخرى.';
    }
  }
  return 'تعذّر حفظ إعدادات القسم. راجع البيانات وحاول مجددًا.';
}

function HomepageWeeklyEpisodesSettings() {
  const { viewer } = useAdminAuth();
  const { data, isMutating, updateHomepageWeeklyEpisodesSettings } = useStudioData();
  const settings = data.homepageWeeklyEpisodesSettings;
  const canManageShows = viewer ? canManagePage(viewer, 'shows') : false;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [title, setTitle] = useState(settings.title);
  const [feedback, setFeedback] = useState('');
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setEnabled(settings.enabled);
    setTitle(settings.title);
  }, [settings.enabled, settings.title, settings.version]);

  const normalizedTitle = title.trim();
  const hasChanges =
    enabled !== settings.enabled || normalizedTitle !== settings.title;

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageShows || isMutating || !hasChanges) return;
    if (!normalizedTitle) {
      setHasError(true);
      setFeedback('أدخل عنوان القسم.');
      return;
    }
    setFeedback('');
    setHasError(false);
    try {
      const updated = await updateHomepageWeeklyEpisodesSettings({
        enabled,
        title: normalizedTitle,
        expectedVersion: settings.version,
      });
      setEnabled(updated.enabled);
      setTitle(updated.title);
      setFeedback('حُفظت إعدادات القسم.');
    } catch (cause) {
      setHasError(true);
      setFeedback(homepageSettingsErrorMessage(cause));
    }
  }

  return (
    <form
      className="card homepage-weekly-settings"
      aria-labelledby="homepage-weekly-settings-title"
      aria-busy={isMutating}
      onSubmit={(event) => void saveSettings(event)}
    >
      <div className="homepage-weekly-settings__intro">
        <h2 id="homepage-weekly-settings-title">قسم حلقات آخر أسبوع</h2>
        <p>يعرض الحلقات المنشورة خلال آخر ٧ أيام من جميع برامج إذاعة مختلف.</p>
      </div>
      <div className="homepage-weekly-settings__controls">
        <Field label="عنوان القسم">
          <Input
            value={title}
            maxLength={80}
            disabled={!canManageShows || isMutating}
            onChange={(event) => {
              setTitle(event.target.value);
              setFeedback('');
            }}
            required
          />
        </Field>
        <div className="homepage-weekly-settings__switch">
          <span>عرض القسم في الصفحة الرئيسية</span>
          <Switch
            checked={enabled}
            disabled={!canManageShows || isMutating}
            onCheckedChange={(checked) => {
              setEnabled(checked);
              setFeedback('');
            }}
            label="عرض القسم في الصفحة الرئيسية"
          />
        </div>
      </div>
      <div className="homepage-weekly-settings__footer">
        <div aria-live="polite">
          {feedback ? (
            <p className={`notice ${hasError ? 'notice--error' : 'notice--success'}`} role={hasError ? 'alert' : 'status'}>
              {feedback}
            </p>
          ) : null}
        </div>
        {canManageShows ? (
          <Button type="submit" variant="primary" disabled={isMutating || !hasChanges}>
            {isMutating ? 'جارٍ الحفظ…' : 'حفظ إعدادات القسم'}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function ShowsView() {
  const { viewer } = useAdminAuth();
  const { data } = useStudioData();
  const canManageShows = viewer ? canManagePage(viewer, 'shows') : false;

  return (
    <>
      <PageHeader
        title="البرامج"
        action={
          canManageShows ? (
            <Link to={adminPaths.showNew} className="button button--primary">
              برنامج جديد
            </Link>
          ) : null
        }
      />

      <HomepageWeeklyEpisodesSettings />

      <section className="card shows-table" aria-label="البرامج" tabIndex={0}>
        <div className="shows-table__row shows-table__row--header" aria-hidden="true">
          <span />
          <span>البرنامج</span>
          <span>المضيف</span>
          <span>التصنيف</span>
          <span>الحلقات</span>
          <span>منشورة</span>
        </div>
        {data.shows.map((show) => {
          const episodes = data.episodes.filter((episode) => episode.showId === show.id);
          const published = episodes.filter((episode) => episode.status === 'published');
          return (
            <article className="shows-table__row" key={show.id}>
              <div className="artwork-placeholder" aria-label={`صورة برنامج ${show.name}`} />
              <div className="table-primary">
                {show.name}
                {show.premium ? <PremiumMark /> : null}
              </div>
              <div className="table-secondary">{show.host}</div>
              <div className="table-secondary">{show.category}</div>
              <div className="table-number">{formatArabicInteger(episodes.length)}</div>
              <div className="table-number">{formatArabicInteger(published.length)}</div>
            </article>
          );
        })}
      </section>
    </>
  );
}

export function CreateShowView() {
  const navigate = useNavigate();
  const { viewer } = useAdminAuth();
  const { createShow } = useStudioData();
  const canManageShows = viewer ? canManagePage(viewer, 'shows') : false;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [host, setHost] = useState('');
  const [category, setCategory] = useState('');
  const [premium, setPremium] = useState(false);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  async function saveShow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageShows || isSaving) return;

    const normalizedSlug = slug.trim();
    if (
      !normalizedSlug ||
      !name.trim() ||
      !description.trim() ||
      !host.trim() ||
      !category.trim()
    ) {
      setError('أكمل جميع الحقول المطلوبة.');
      return;
    }
    if (!SLUG_PATTERN.test(normalizedSlug)) {
      setError('اكتب المعرّف بحروف إنجليزية صغيرة وأرقام وشرطات فقط.');
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      await createShow({
        slug: normalizedSlug,
        name: name.trim(),
        description: description.trim(),
        host: host.trim(),
        category: category.trim(),
        premium,
      });
      navigate(adminPaths.shows, { replace: true });
    } catch (cause) {
      setError(showSaveErrorMessage(cause));
      setIsSaving(false);
    }
  }

  return (
    <div className="content-create-page">
      <PageBreadcrumb
        parentLabel="البرامج"
        parentTo={adminPaths.shows}
        current="برنامج جديد"
      />
      <header className="page-header">
        <div className="page-header__title-row">
          <h1 ref={headingRef} tabIndex={-1} id="new-show-title">
            برنامج جديد
          </h1>
          <div className="page-header__detail">أدخل بيانات البرنامج الأساسية.</div>
        </div>
      </header>

      <form
        className="card content-create-form"
        aria-labelledby="new-show-title"
        aria-busy={isSaving}
        onSubmit={(event) => void saveShow(event)}
        noValidate
      >
        <div className="inline-create-grid inline-create-grid--shows">
          <Field label="اسم البرنامج">
            <Input
              value={name}
              disabled={isSaving}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field label="المعرّف في الرابط" hint="حروف إنجليزية صغيرة وأرقام وشرطات فقط.">
            <Input
              dir="ltr"
              value={slug}
              disabled={isSaving}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="outside-the-frame"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </Field>
          <Field label="المضيف">
            <Input
              value={host}
              disabled={isSaving}
              onChange={(event) => setHost(event.target.value)}
              required
            />
          </Field>
          <Field label="التصنيف">
            <Input
              value={category}
              disabled={isSaving}
              onChange={(event) => setCategory(event.target.value)}
              required
            />
          </Field>
          <Field label="وصف البرنامج" className="inline-create-grid__full">
            <Textarea
              value={description}
              disabled={isSaving}
              onChange={(event) => setDescription(event.target.value)}
              required
            />
          </Field>
          <div className="inline-switch-field">
            <span>برنامج حصري</span>
            <Switch
              checked={premium}
              disabled={isSaving}
              onCheckedChange={setPremium}
              label="برنامج حصري"
            />
          </div>
        </div>

        <div className="content-create-form__footer">
          <div className="content-create-form__feedback" aria-live="polite">
            {error ? (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" variant="primary" disabled={isSaving}>
            {isSaving ? 'جارٍ الحفظ…' : 'حفظ البرنامج'}
          </Button>
        </div>
      </form>
    </div>
  );
}
