import { useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import type { AudioTransferSnapshot, EpisodeAudioTransfer } from '@/data/episode-audio-transfer';
import { Button } from '@/shared/ui/primitives';

export function audioFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(0)} ك.ب`
    : `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}
const labels: Record<AudioTransferSnapshot['phase'], string> = {
  preparing: 'جارٍ تجهيز الرفع',
  uploading: 'جارٍ رفع الصوت',
  paused: 'الرفع متوقف مؤقتًا',
  error: 'توقف الرفع. يمكنك المتابعة',
  finalizing: 'جارٍ التحقق من الملف',
  'verification-error': 'تعذّر تأكيد اكتمال الرفع',
  cancelling: 'جارٍ إلغاء الرفع',
  'cancel-error': 'تعذّر تأكيد الإلغاء',
  cancelled: 'أُلغي الرفع',
  completed: 'اكتمل رفع الصوت',
  failed: 'تعذّر إكمال الرفع',
};

function RouterUploadGuard({ active }: { active: boolean }) {
  const blocker = useBlocker(active);
  useEffect(() => {
    if (!active && blocker.state === 'blocked') blocker.reset();
  }, [active, blocker]);
  if (blocker.state !== 'blocked') return null;
  return (
    <div className="audio-upload__notice" role="alert">
      <p>الرفع لم يكتمل. أكمله أو ألغِه قبل مغادرة الصفحة.</p>
      <Button type="button" onClick={() => blocker.reset()}>
        البقاء في الصفحة
      </Button>
    </div>
  );
}

export function AudioUploadPanel({
  file,
  fileName,
  disabled,
  invalid,
  state,
  transfer,
  onSelect,
  onClear,
  onUpload,
  isNew = false,
}: {
  file?: File;
  fileName?: string;
  disabled: boolean;
  invalid: boolean;
  state?: AudioTransferSnapshot;
  transfer?: EpisodeAudioTransfer;
  onSelect(file: File): void;
  onClear(): void;
  onUpload(): void;
  isNew?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const active =
    disabled && Boolean(state) && !['cancelled', 'completed', 'failed'].includes(state!.phase);
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
  const phase = state?.phase;
  const progress = state ? Math.min(100, Math.floor((state.loaded / state.total) * 100)) : 0;
  const resumable =
    phase && ['paused', 'error', 'verification-error', 'cancel-error'].includes(phase);
  const cancellable = phase && ['uploading', 'paused', 'error'].includes(phase);
  return (
    <>
      {dataRouter ? <RouterUploadGuard active={active} /> : null}
      <div
        className={`audio-upload${dragging ? ' audio-upload--dragging' : ''}`}
        data-phase={phase ?? 'ready'}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && event.dataTransfer.files[0]) onSelect(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          className="sr-only"
          id="episode-audio"
          type="file"
          aria-label="اختيار ملف الصوت"
          accept="audio/mpeg,audio/wav,.mp3,.wav"
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => {
            const selected = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (selected) onSelect(selected);
          }}
        />
        <div className="audio-upload__file">
          <div className="audio-upload__identity">
            <strong dir={fileName ? 'auto' : undefined}>{fileName ?? 'ملف الصوت النهائي'}</strong>
            <span>{file ? audioFileSize(file.size) : 'MP3 أو WAV، حتى 500 م.ب'}</span>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="quiet"
              className="audio-upload__choose"
              onClick={() => input.current?.click()}
            >
              {fileName ? 'اختيار ملف آخر' : 'تصفح الملفات'}
            </Button>
          )}
        </div>
        {!state && (
          <p className="audio-upload__hint">
            {file
              ? isNew
                ? 'الملف جاهز. الرفع ينشئ مسودة ويربط الصوت بها دون نشر الحلقة.'
                : 'الملف جاهز. اضغط «رفع الملف» لربطه بالحلقة.'
              : fileName
                ? 'صوت الحلقة محفوظ. يمكنك اختيار ملف لاستبداله.'
                : 'اسحب الملف إلى هذه المساحة أو اختره من جهازك.'}
          </p>
        )}
        {state && (
          <div className="audio-upload__transfer">
            <div className="audio-upload__status">
              <span role="status" aria-live="polite">
                {labels[state.phase]}
              </span>
              <strong className="audio-upload__percent" aria-hidden="true">
                {progress}
                <small>٪</small>
              </strong>
            </div>
            <progress
              className="audio-upload__progress"
              max={100}
              value={progress}
              aria-label="تقدم رفع الصوت"
            />
            <div className="audio-upload__measurement">
              <span>
                {audioFileSize(state.loaded)} من {audioFileSize(state.total)}
              </span>
              {state.confirmed > 0 && state.phase !== 'completed' && (
                <span>المحفوظ: {audioFileSize(state.confirmed)}</span>
              )}
            </div>
            <p className="audio-upload__hint">
              {state.phase === 'completed'
                ? 'الملف محفوظ ومرتبط بالحلقة.'
                : state.phase === 'failed'
                  ? 'راجع رسالة الخطأ قبل المحاولة مجددًا.'
                  : state.phase === 'cancelled'
                    ? 'أُلغي رفع الملف الجديد. صوت الحلقة السابق لم يتغير.'
                    : state.phase === 'finalizing'
                      ? 'وصلت الأجزاء. نتحقق من التخزين قبل ربط الصوت بالحلقة.'
                      : state.phase === 'verification-error'
                        ? 'قد يكون الملف محفوظًا. أعد التحقق دون رفعه مجددًا.'
                        : state.phase === 'cancel-error'
                          ? 'تحقق من الاتصال، ثم أعد محاولة الإلغاء.'
                          : state.phase === 'paused'
                            ? 'الأجزاء المكتملة محفوظة. أبقِ الصفحة مفتوحة للاستئناف.'
                            : state.phase === 'error'
                              ? 'تحقق من الاتصال ثم استأنف من آخر جزء مكتمل.'
                              : 'يمكنك إيقاف الرفع واستئنافه ما دامت الصفحة مفتوحة.'}
            </p>
            <div className="audio-upload__actions">
              {phase === 'uploading' && (
                <Button type="button" onClick={() => transfer?.pause()}>
                  إيقاف مؤقت
                </Button>
              )}
              {resumable && (
                <Button type="button" onClick={() => transfer?.resume()}>
                  {phase === 'verification-error'
                    ? 'إعادة التحقق'
                    : phase === 'cancel-error'
                      ? 'إعادة محاولة الإلغاء'
                      : 'استئناف الرفع'}
                </Button>
              )}
              {cancellable && (
                <Button type="button" variant="danger" onClick={() => transfer?.cancel()}>
                  إلغاء الرفع
                </Button>
              )}
            </div>
          </div>
        )}
        {file && !disabled && (!state || ['cancelled', 'failed'].includes(state.phase)) && (
          <div className="audio-upload__actions">
            <Button type="button" variant="primary" onClick={onUpload}>
              رفع الملف
            </Button>
            <Button type="button" variant="quiet" onClick={onClear}>
              إلغاء الاختيار
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
