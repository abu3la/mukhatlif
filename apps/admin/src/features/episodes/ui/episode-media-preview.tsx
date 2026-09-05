import { useEffect, useState } from 'react';
import { parseYouTubeVideoId, youtubeThumbnailUrl } from '@mukhtalif/types';
import { Button } from '@/shared/ui/primitives';

interface Props {
  title: string;
  youtubeUrl: string;
  savedAudioUrl?: string;
  file?: File;
  publishedUrl?: string;
}

/** Read-only media inspection: never saves, publishes or uploads a file. */
export function EpisodeMediaPreview({
  title,
  youtubeUrl,
  savedAudioUrl,
  file,
  publishedUrl,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'saved' | 'file' | 'video'>('saved');
  const [localUrl, setLocalUrl] = useState<string>();
  const [audioError, setAudioError] = useState(false);
  const videoId = parseYouTubeVideoId(youtubeUrl);
  const image = youtubeThumbnailUrl(videoId);

  useEffect(() => {
    if (!open || !file) {
      setLocalUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, open]);

  const audioUrl = mode === 'file' ? localUrl : savedAudioUrl;
  useEffect(() => {
    setAudioError(false);
  }, [audioUrl, mode, open]);

  return (
    <section className="card episode-media-preview" aria-label="معاينة الحلقة">
      <Button
        type="button"
        variant="quiet"
        aria-expanded={open}
        aria-controls="episode-media-preview-panel"
        onClick={() => setOpen(!open)}
      >
        {open ? 'إغلاق المعاينة' : 'معاينة الحلقة'}
      </Button>
      {open && (
        <div id="episode-media-preview-panel" className="episode-media-preview__body">
          <h2>{title.trim() || 'معاينة الحلقة'}</h2>
          <p>المعاينة لا تحفظ التعديلات ولا تنشر الحلقة.</p>
          {image && (
            <img
              className="episode-media-preview__cover"
              src={image}
              alt="صورة بطاقة الحلقة"
              width={480}
              height={270}
            />
          )}
          <div className="episode-media-preview__actions" aria-label="اختيار وسيلة المعاينة">
            <Button
              type="button"
              variant="quiet"
              aria-pressed={mode === 'saved'}
              onClick={() => setMode('saved')}
            >
              الصوت المحفوظ
            </Button>
            {file && (
              <Button
                type="button"
                variant="quiet"
                aria-pressed={mode === 'file'}
                onClick={() => setMode('file')}
              >
                الملف المختار
              </Button>
            )}
            {videoId && (
              <Button
                type="button"
                variant="quiet"
                aria-pressed={mode === 'video'}
                onClick={() => setMode('video')}
              >
                مشاهدة الحلقة
              </Button>
            )}
          </div>
          {mode === 'video' ? (
            videoId ? (
              <iframe
                key={videoId}
                className="episode-media-preview__video"
                src={`https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0`}
                title={`مشاهدة ${title || 'الحلقة'}`}
                allow="encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            ) : (
              <p>أضف رابط YouTube صالحًا لمعاينة الفيديو.</p>
            )
          ) : audioUrl ? (
            <>
              {mode === 'file' && (
                <p>
                  ملف من جهازك، لم يُرفع بعد: <bdi>{file?.name}</bdi>
                </p>
              )}
              <audio
                key={audioUrl}
                controls
                preload="none"
                src={audioUrl}
                aria-label={mode === 'file' ? 'معاينة الملف المختار' : 'معاينة الصوت المحفوظ'}
                onError={() => setAudioError(true)}
                onLoadedData={() => setAudioError(false)}
              />
              {audioError && (
                <p role="alert">تعذّر تشغيل الصوت. تحقق من الاتصال وأعد فتح المعاينة.</p>
              )}
            </>
          ) : (
            <p>لا يتوفر صوت عام لهذه الحلقة. يمكنك اختيار ملف لمعاينته دون رفعه.</p>
          )}
          {publishedUrl && (
            <a href={publishedUrl} target="_blank" rel="noopener noreferrer">
              فتح الحلقة على الموقع
            </a>
          )}
        </div>
      )}
    </section>
  );
}
