import { LoadingRegion } from '@/components/states';

export default function Loading() {
  return (
    <div className="content-page guest-library">
      <div className="content-container" aria-busy="true">
        <section className="guest-library__hero">
          <div className="guest-library__intro">
            <h1 className="guest-library__title">ضيوفنا</h1>
            <p className="guest-library__lede">ننتقي ضيوفنا لنثري الحوار</p>
          </div>
        </section>
        <div className="guest-loading">
          <LoadingRegion label="جارٍ تحميل مكتبة الضيوف…" />
          <div className="guest-grid" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="skeleton guest-loading__card" key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
