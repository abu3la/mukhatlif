import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <div className="state">
        <h1 className="state__title">الصفحة غير موجودة</h1>
        <p className="state__text">
          الرابط الذي فتحته لا يقود إلى صفحة على هذا الموقع. قد تكون أُزيلت أو تغيّر عنوانها.
        </p>
        <Link className="action" href="/">
          العودة إلى الرئيسية
        </Link>
      </div>
    </div>
  );
}
