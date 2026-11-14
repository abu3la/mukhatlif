import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="shell">
      <div className="state">
        <h1 className="state__title">ما لقينا الصفحة اللي تبحث عنها.</h1>
        <div className="public-reading-controls">
          <Link className="public-primary" href="/">
            ارجع للرئيسية
          </Link>
          <Link href="/search">ابحث في مختلف</Link>
        </div>
      </div>
    </div>
  );
}
