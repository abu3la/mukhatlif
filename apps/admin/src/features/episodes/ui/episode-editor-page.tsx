import { useMemo, useRef, useState } from 'react';
import {
  AudioTransferCancelled,
  EpisodeAudioTransfer,
  type AudioTransferSnapshot,
} from '@/data/episode-audio-transfer';
import { AudioUploadPanel } from './audio-upload-panel';
import { parseYouTubeVideoId, youtubeThumbnailUrl } from '@mukhtalif/types';
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
  const { data, saveEpisode, uploadEpisodeAudio } = useStudioData();
  const canManageEpisodes = viewer ? canManagePage(viewer, 'episodes') : false;
  const [createdId, setCreatedId] = useState<EpisodeId>();
  const episode = data.episodes.find((item) => item.id === (episodeId ?? createdId));
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
  const [youtubeUrl, setYoutubeUrl] = useState(
    episode?.youtubeVideoId ? `https://www.youtube.com/watch?v=${episode.youtubeVideoId}` : '',
  );
  const [premium, setPremium] = useState(initial.premium);
  const [scheduledAt, setScheduledAt] = useState(initial.scheduledAt);
  const [audioFile, setAudioFile] = useState<File>();
  const transfer = useRef<EpisodeAudioTransfer | undefined>(undefined);
  const [uploadState, setUploadState] = useState<AudioTransferSnapshot>();
  const [saveNotice, setSaveNotice] = useState('');
  const [uploadedName, setUploadedName] = useState<string>();
  const [pendingStatus, setPendingStatus] = useState<EpisodeStatus | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<
    EpisodeNumericField | 'title' | 'showId' | 'scheduledAt' | 'audioFile' | 'youtubeUrl' | null
  >(null);

  const isSaving = pendingStatus !== null || isUploading;
  const displayedAudioFileName = audioFile?.name ?? uploadedName ?? episode?.audioFileName;

  function clearError() {
    setError('');
    setInvalidField(null);
  }

  function selectAudioFile(file: File) {
    const validationMessage = validateEpisodeAudioFile(file);
    if (validationMessage) {
      setError(validationMessage);
      setInvalidField('audioFile');
      return;
    }

    setAudioFile(file);
    setUploadState(undefined);
    setSaveNotice('');
    clearError();
  }

  function validateDraft() {
    if (!title.trim()) {
      setError('أدخل عنوان الحلقة أولًا.');
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

    const youtubeVideoId = youtubeUrl.trim() ? parseYouTubeVideoId(youtubeUrl) : null;
    if (youtubeUrl.trim() && !youtubeVideoId) {
      setError('أدخل رابط حلقة صالحًا من YouTube.');
      setInvalidField('youtubeUrl');
      return;
    }
    return {
      id: episode?.id ?? createdId,
      title: title.trim(),
      showId,
      episodeNumber: numericValues.episodeNumber,
      durationMinutes: numericValues.durationMinutes,
      notes: notes.trim(),
      premium,
      scheduledAt: scheduledAt || undefined,
      onDraftSaved: setCreatedId,
      youtubeVideoId,
    };
  }

  async function save(status: EpisodeStatus) {
    if (!canManageEpisodes || isSaving) return;
    clearError();
    const draft = validateDraft();
    if (!draft) return;
    if (status === 'scheduled' && !scheduledAt) {
      setError('اختر موعد النشر قبل جدولة الحلقة.');
      setInvalidField('scheduledAt');
      return;
    }
    if (audioFile && status !== 'draft' && status !== episode?.status) {
      setError('ارفع الملف المختار أو ألغِ اختياره قبل نشر الحلقة أو جدولتها.');
      setInvalidField('audioFile');
      return;
    }
    setPendingStatus(status);
    setSaveNotice('');
    try {
      const id = await saveEpisode(draft, status);
      setCreatedId(id);
      if (audioFile) setSaveNotice('حُفظت بيانات الحلقة. الملف المختار لم يُرفع بعد.');
      else
        navigate(`${adminPaths.episodes}?status=${encodeURIComponent(status)}`, { replace: true });
    } catch (cause) {
      setError(getEpisodeOperationErrorMessage(cause, 'save'));
    } finally {
      setPendingStatus(null);
    }
  }

  async function uploadAudio() {
    if (!canManageEpisodes || isSaving || !audioFile) return;
    clearError();
    // Existing episodes only need their id: unsaved metadata belongs to Save.
    const draft = episode ? { ...episode, onDraftSaved: setCreatedId } : validateDraft();
    if (!draft) return;
    const selected = audioFile;
    setIsUploading(true);
    setSaveNotice('');
    transfer.current = new EpisodeAudioTransfer(selected.size, setUploadState);
    setUploadState(transfer.current.snapshot);
    try {
      const id = await uploadEpisodeAudio({
        ...draft,
        audioFile: selected,
        audioTransfer: transfer.current,
        onAudioUploaded: () => {
          setUploadedName(selected.name);
          setAudioFile(undefined);
        },
      });
      setCreatedId(id);
      setUploadedName(selected.name);
      setAudioFile(undefined);
      setSaveNotice(
        episode
          ? 'الصوت مرتبط بالحلقة. احفظ تعديلات البيانات عند الانتهاء.'
          : 'الصوت مرتبط بمسودة الحلقة. لم تُنشر الحلقة.',
      );
    } catch (cause) {
      if (cause instanceof AudioTransferCancelled)
        setSaveNotice('أُلغي رفع الصوت. بيانات الحلقة المحفوظة لم تتغير.');
      else {
        setError(getEpisodeOperationErrorMessage(cause, 'upload'));
        if (transfer.current?.snapshot.phase === 'preparing') setUploadState(undefined);
      }
    } finally {
      setIsUploading(false);
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
        <PageBreadcrumb parentLabel="الحلقات" parentTo={adminPaths.episodes} current="حلقة جديدة" />
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

          <Field
            label="رابط الحلقة في YouTube"
            hint="اختياري. أضف رابط الحلقة الكاملة. حذف الرابط يخفي الفيديو وصورته."
          >
            <Input
              value={youtubeUrl}
              dir="ltr"
              type="url"
              placeholder="https://www.youtube.com/watch?v=…"
              disabled={isSaving}
              readOnly={!canManageEpisodes}
              aria-invalid={invalidField === 'youtubeUrl'}
              onChange={(event) => {
                setYoutubeUrl(event.target.value);
                clearError();
              }}
            />
            {youtubeThumbnailUrl(parseYouTubeVideoId(youtubeUrl)) ? (
              <img
                className="episode-video-preview"
                src={youtubeThumbnailUrl(parseYouTubeVideoId(youtubeUrl))!}
                alt="معاينة صورة فيديو الحلقة"
                width={320}
                height={180}
                loading="lazy"
              />
            ) : null}
          </Field>

          <section className="field" aria-label="ملف الصوت">
            <span className="field__label">ملف الصوت</span>
            {!canManageEpisodes ? (
              <p className="row-copy__meta" dir={displayedAudioFileName ? 'ltr' : undefined}>
                {displayedAudioFileName ?? 'لا يوجد ملف صوت.'}
              </p>
            ) : (
              <AudioUploadPanel
                file={audioFile}
                fileName={displayedAudioFileName}
                disabled={isSaving}
                invalid={invalidField === 'audioFile'}
                state={uploadState}
                transfer={transfer.current}
                isNew={!episode && !createdId}
                onUpload={() => void uploadAudio()}
                onSelect={selectAudioFile}
                onClear={() => {
                  setAudioFile(undefined);
                  setUploadState(undefined);
                }}
              />
            )}
            {saveNotice && (
              <p className="audio-upload__saved" role="status">
                {saveNotice}
              </p>
            )}
          </section>
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
