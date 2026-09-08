import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <div className="state">
        <h1 className="state__title">الصفحة غير موجودة</h1>
        <p className="state__text">
          الرابط الذي فتحته لا يقود إلى صفحة على هذا الموقع. قد تكون أُزيلت أو تغيّر عنوانها.
        </p>
        <div className="public-reading-controls">
          <Link className="public-primary" href="/">
            العودة إلى الرئيسية
          </Link>
          <Link href="/search">ابحث في مختلف</Link>
        </div>
      </div>
    </div>
  );
}
