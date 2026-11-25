import type { Metadata } from 'next';
import Link from 'next/link';
import { PARTICIPATION_PATHS } from '@/components/communities';

export const metadata: Metadata = {
  title: 'تواصل مع مختلف',
  description: 'عندك سؤال أو ملاحظة؟ اكتب لنا.',
  alternates: { canonical: '/contact' },
};

const EMAIL = 'Info@mukhtalif.net';

/** The three requests with a form of their own, in the order this page lists them. */
const ORDER = ['/sponsor', '/suggest', '/join-us'];
const paths = [...PARTICIPATION_PATHS].sort(
  (a, b) => ORDER.indexOf(a.href) - ORDER.indexOf(b.href),
);

/**
 * «تواصل مع مختلف» on the presentation site (D-24). The night stage carries
 * the page's one action and the address itself, set large enough to read
 * from across a room and selected whole with one click; the sheet lists the
 * specific requests as large typographic rows, each with its own way in.
 */
export default function ContactPage() {
  return (
    <div className="stage-page contact-page">
      <div className="stage-scope">
        <section className="stage-intro contact-stage" aria-labelledby="contact-title">
          <div className="content-container stage-head">
            <h1 id="contact-title" className="stage-statement">
              تواصل مع مختلف
            </h1>
            <p className="stage-head__lede">
              عندك سؤال أو ملاحظة؟ اكتب لنا، وخلّ بيانات التواصل عشان نقدر نرد عليك.
            </p>
            <div className="stage-head__actions">
              <a className="public-primary" href={`mailto:${EMAIL}`}>
                أرسل رسالتك
              </a>
            </div>
            <p className="contact-mail">
              <span className="contact-mail__lead">أو اكتب مباشرة إلى</span>
              <bdi className="contact-mail__address" dir="ltr">
                {EMAIL}
              </bdi>
            </p>
          </div>
        </section>
      </div>

      <div className="home-sheet">
        <div className="home-sheet__surface">
          <section className="content-container" aria-labelledby="contact-paths-title">
            {/* The rows name themselves; their heading is for the page's outline. */}
            <h2 className="visually-hidden" id="contact-paths-title">
              طلبات محددة
            </h2>
            <ul className="contact-paths">
              {paths.map((path) => (
                <li className="contact-path" key={path.href}>
                  <h3 className="contact-path__title">{path.title}</h3>
                  <p className="contact-path__text">{path.text}</p>
                  <Link className="stage-link" href={path.href}>
                    {path.action}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
