import './upload-progress.css';

type UploadProgressProps = { filename: string; bytes: number; percent: number };

export function UploadProgress({ filename, bytes, percent }: UploadProgressProps) {
  const value = Math.max(0, Math.min(100, Math.floor(percent)));
  const size = bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
    : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
  return (
    <section className="file-transfer" aria-label={`رفع ${filename}`}>
      <div className="file-transfer__heading">
        <div className="file-transfer__identity">
          <strong>{value === 100 ? 'جار حفظ الملف' : 'جار رفع الملف'}</strong>
          <span className="file-transfer__filename" dir="auto">{filename}</span>
        </div>
        <div className="file-transfer__counter" aria-hidden="true">
          <span>{value}</span><small>٪</small>
        </div>
      </div>
      <progress className="file-transfer__track" max={100} value={value}
        aria-label={`تقدم رفع ${filename}`} aria-valuetext={`${value}٪`} />
      <div className="file-transfer__details">
        <span>{value === 100 ? 'اكتمل النقل، ننتظر تأكيد الحفظ' : 'أبق الصفحة مفتوحة حتى يكتمل الرفع'}</span>
        <span dir="ltr">{size}</span>
      </div>
    </section>
  );
}
