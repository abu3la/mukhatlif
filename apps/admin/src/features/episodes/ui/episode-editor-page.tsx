import { type ChangeEvent, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import {
  getEpisodeOperationErrorMessage,
  normalizeEpisodeNumericInput,
  validateEpisodeAudioFile,
  validateEpisodeNumbers,
  type EpisodeNumericField,
} from '@/features/episodes/model/episode-form';
import { isoToRiyadhLocalInput, type EpisodeId, type EpisodeStatus, type ShowId } from '@/lib';
import {
  Button,
  Field,
  Input,
  PageBreadcrumb,
  PageHeader,
  Select,
  StatusBadge,
  Switch,
  Textarea,
} from '@/shared/ui/primitives';

export function EpisodeEditorView() {
  const { viewer } = useAdminAuth();
  const navigate = useNavigate();
  const { episodeId } = useParams<{ episodeId?: EpisodeId }>();
  const [searchParams] = useSearchParams();
  const { data, saveEpisode } = useStudioData();
  const canManageEpisodes = viewer ? canManagePage(viewer, 'episodes') : false;
  const episode = data.episodes.find((item) => item.id === episodeId);
  const schedulingIntent = searchParams.get('intent') === 'schedule';
  const firstShowId = data.shows[0]?.id ?? ('show_unassigned' as ShowId);

  const initial = useMemo(
    () => ({
      title: episode?.title ?? '',
      showId: episode?.showId ?? firstShowId,
      episodeNumber: episode?.episodeNumber?.toString() ?? '',
      durationMinutes: episode?.durationMinutes?.toString() ?? '',
      notes: episode?.notes ?? '',
      premium: episode?.premium ?? false,
      scheduledAt: episode?.scheduledAt ? isoToRiyadhLocalInput(episode.scheduledAt) : '',
    }),
    [episode, firstShowId],
  );
  const [title, setTitle] = useState(initial.title);
  const [showId, setShowId] = useState<ShowId>(initial.showId);
  const [episodeNumber, setEpisodeNumber] = useState(initial.episodeNumber);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [notes, setNotes] = useState(initial.notes);
  const [premium, setPremium] = useState(initial.premium);
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt);
  const [audioFile, setAudioFile] = useState<File>();
  const [pendingStatus, setPendingStatus] = useState<EpisodeStatus | null>(null);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<
    EpisodeNumericField | 'title' | 'showId' | 'scheduledAt' | 'audioFile' | null
  >(null);

  const isSaving = pendingStatus !== null;
  const displayedAudioFileName = audioFile?.name ?? episode?.audioFileName;

  function clearError() {
    setError('');
    setInvalidField(null);
  }

  function selectAudioFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;

    const validationMessage = validateEpisodeAudioFile(file);
    if (validationMessage) {
      setError(validationMessage);
      setInvalidField('audioFile');
      return;
    }

    setAudioFile(file);
    clearError();
  }

  async function save(status: EpisodeStatus) {
    if (!canManageEpisodes || isSaving) return;
    clearError();

    if (!title.trim()) {
      setError('أدخل عنوان الحلقة قبل الحفظ.');
      setInvalidField('title');
      return;
    }
    if (!data.shows.some((show) => show.id === showId)) {
      setError('اختر برنامجًا من القائمة.');
      setInvalidField('showId');
      return;
    }

    const numericValues = validateEpisodeNumbers(episodeNumber, durationMinutes);
    if (!numericValues.ok) {
      setError(numericValues.message);
      setInvalidField(numericValues.field);
      return;
    }

    if (status === 'scheduled' && !scheduledAt) {
      setError('اختر موعد النشر قبل جدولة الحلقة.');
      setInvalidField('scheduledAt');
      return;
    }

    setPendingStatus(status);
    try {
      await saveEpisode(
        {
          id: episode?.id,
          title: title.trim(),
          showId,
          episodeNumber: numericValues.episodeNumber,
          durationMinutes: numericValues.durationMinutes,
          notes: notes.trim(),
          premium,
          scheduledAt: scheduledAt || undefined,
          audioFile,
        },
        status,
      );
      navigate(`${adminPaths.episodes}?status=${encodeURIComponent(status)}`, { replace: true });
    } catch (cause) {
      setError(getEpisodeOperationErrorMessage(cause, 'save'));
      setPendingStatus(null);
    }
  }

  const primaryStatus: EpisodeStatus =
    episode && episode.status !== 'draft'
      ? episode.status
      : scheduledAt || schedulingIntent
        ? 'scheduled'
        : 'published';
  const primaryLabel =
    primaryStatus === 'scheduled'
      ? episode?.status === 'scheduled'
        ? 'حفظ الجدولة'
        : 'جدولة'
      : primaryStatus === 'published' && episode?.status === 'published'
        ? 'حفظ التغييرات'
        : primaryStatus === 'archived'
          ? 'حفظ التغييرات'
          : 'نشر';
  const canSaveDraft = !episode || episode.status === 'draft';

  if (!episode && !canManageEpisodes) {
    return (
      <>
        <PageBreadcrumb
          parentLabel="الحلقات"
          parentTo={adminPaths.episodes}
          current="حلقة جديدة"
        />
        <PageHeader title="حلقة جديدة" />
        <section className="card form-card" role="status">
          <p className="empty-state">لا تملك صلاحية إنشاء حلقة.</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageBreadcrumb
        parentLabel="الحلقات"
        parentTo={adminPaths.episodes}
        current={episode ? (canManageEpisodes ? 'تحرير حلقة' : 'تفاصيل الحلقة') : 'حلقة جديدة'}
      />

      <PageHeader
        title={episode ? (canManageEpisodes ? 'تحرير حلقة' : 'تفاصيل الحلقة') : 'حلقة جديدة'}
        action={
          canManageEpisodes ? (
            <>
              {canSaveDraft ? (
                <Button
                  type="button"
                  variant="quiet"
                  disabled={isSaving}
                  onClick={() => void save('draft')}
                >
                  {pendingStatus === 'draft' ? 'جارٍ الحفظ' : 'حفظ كمسودة'}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="primary"
                disabled={isSaving}
                onClick={() => void save(primaryStatus)}
              >
                {pendingStatus === primaryStatus ? 'جارٍ الحفظ' : primaryLabel}
              </Button>
            </>
          ) : null
        }
      />

      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="editor-grid">
        <section className="card form-card" aria-label="بيانات الحلقة" aria-busy={isSaving}>
          <Field label="عنوان الحلقة">
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                clearError();
              }}
              placeholder="اكتب عنوان الحلقة بالعربية"
              required
              disabled={isSaving}
              readOnly={!canManageEpisodes}
              aria-invalid={invalidField === 'title'}
              autoFocus={canManageEpisodes}
            />
          </Field>

          <div className="form-row">
            <Field
              label="البرنامج"
              hint={episode ? 'لا يمكن نقل الحلقة إلى برنامج آخر بعد إنشائها.' : undefined}
            >
              <Select
                value={showId}
                disabled={Boolean(episode) || isSaving || !canManageEpisodes}
                aria-invalid={invalidField === 'showId'}
                onChange={(event) => {
                  setShowId(event.target.value as ShowId);
                  clearError();
                }}
              >
                {data.shows.map((show) => (
                  <option key={show.id} value={show.id}>
                    {show.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="رقم الحلقة">
              <Input
                value={episodeNumber}
                onChange={(event) => {
                  setEpisodeNumber(normalizeEpisodeNumericInput(event.target.value));
                  clearError();
                }}
                inputMode="numeric"
                dir="ltr"
                lang="en"
                required
                disabled={isSaving}
                readOnly={!canManageEpisodes}
                aria-invalid={invalidField === 'episodeNumber'}
              />
            </Field>
            <Field label="المدة (بالدقائق)">
              <Input
                value={durationMinutes}
                onChange={(event) => {
                  setDurationMinutes(normalizeEpisodeNumericInput(event.target.value));
                  clearError();
                }}
                inputMode="decimal"
                dir="ltr"
                lang="en"
                required
                disabled={isSaving}
                readOnly={!canManageEpisodes}
                aria-invalid={invalidField === 'durationMinutes'}
              />
            </Field>
          </div>

          <Field label="ملاحظات الحلقة">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="ما الذي سيسمعه المستمع في هذه الحلقة؟"
              disabled={isSaving}
              readOnly={!canManageEpisodes}
            />
          </Field>

          <Field label="ملف الصوت">
            {!canManageEpisodes ? (
              <p className="row-copy__meta" dir={displayedAudioFileName ? 'ltr' : undefined}>
                {displayedAudioFileName ?? 'لا يوجد ملف صوت.'}
              </p>
            ) : displayedAudioFileName ? (
              <div className="upload-file-row">
                <span dir="ltr">{displayedAudioFileName}</span>
                <div className="row-actions">
                  <label
                    className="button button--quiet"
                    htmlFor="episode-audio"
                    aria-disabled={isSaving}
                  >
                    {audioFile ? 'اختيار ملف آخر' : 'استبدال الملف'}
                  </label>
                  {audioFile ? (
                    <Button
                      type="button"
                      variant="danger"
                      disabled={isSaving}
                      onClick={() => setAudioFile(undefined)}
                    >
                      إلغاء الاختيار
                    </Button>
                  ) : null}
                </div>
                <input
                  className="sr-only"
                  id="episode-audio"
                  type="file"
                  accept="audio/mpeg,audio/wav,.mp3,.wav"
                  disabled={isSaving}
                  aria-invalid={invalidField === 'audioFile'}
                  onChange={selectAudioFile}
                />
              </div>
            ) : (
              <div className="upload-zone">
                <div>
                  <p>اختر ملف الصوت النهائي للحلقة.</p>
                  <label className="button button--quiet" htmlFor="episode-audio">
                    تصفح الملفات
                  </label>
                  <input
                    className="sr-only"
                    id="episode-audio"
                    type="file"
                    accept="audio/mpeg,audio/wav,.mp3,.wav"
                    disabled={isSaving}
                    aria-invalid={invalidField === 'audioFile'}
                    onChange={selectAudioFile}
                  />
                  <small>MP3 أو WAV، حتى 500 م.ب</small>
                </div>
              </div>
            )}
          </Field>
        </section>

        <aside className="card publish-card" aria-label="إعدادات النشر">
          <h2>النشر</h2>
          <div className="publish-block publish-status-row">
            <span>الحالة</span>
            <StatusBadge status={episode?.status ?? 'draft'} />
          </div>
          <div className="publish-block">
            <Field label="جدولة النشر" hint="اتركه فارغًا للنشر الفوري.">
              <Input
                type="datetime-local"
                dir="ltr"
                lang="en"
                value={scheduledAt}
                disabled={isSaving}
                readOnly={!canManageEpisodes}
                aria-invalid={invalidField === 'scheduledAt'}
                onChange={(event) => {
                  setScheduledAt(event.target.value);
                  clearError();
                }}
              />
            </Field>
          </div>
          <div className="publish-block premium-toggle-row">
            <div className="premium-toggle-copy">
              <strong>حلقة حصرية لمختلف بلس</strong>
              <p>تحمل علامة «حصري» وتظهر للمشتركين فقط.</p>
            </div>
            {canManageEpisodes ? (
              <Switch
                checked={premium}
                disabled={isSaving}
                onCheckedChange={setPremium}
                label="حلقة حصرية لمختلف بلس"
              />
            ) : (
              <span>{premium ? 'نعم' : 'لا'}</span>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
