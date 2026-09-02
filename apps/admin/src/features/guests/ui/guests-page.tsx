import { Link } from 'react-router-dom';
import { adminPaths, canManagePage, useAdminAuth, useStudioData } from '@/application';
import { PageHeader } from '@/shared/ui/primitives';
import {
  formatGuestAppearanceSummary,
  formatGuestCount,
  SOCIAL_PLATFORM_LABELS,
  socialProfileUrl,
} from '@/lib';

export function GuestsView() {
  const { viewer } = useAdminAuth();
  const { data } = useStudioData();
  const canManageGuests = viewer ? canManagePage(viewer, 'guests') : false;

  if (!data.guestDirectory) {
    return (
      <>
        <PageHeader title="الضيوف" />
        <section
          className="card form-card"
          role="status"
          aria-labelledby="guests-unavailable-title"
        >
          <h2 id="guests-unavailable-title">إدارة الضيوف غير متاحة</h2>
          <p className="empty-state">
            إدارة الضيوف غير مفعّلة في مصدر البيانات الحالي. تواصل مع مسؤول النظام لتفعيلها.
          </p>
        </section>
      </>
    );
  }

  const { guestAppearances, guests, guestSocials } = data.guestDirectory;

  return (
    <>
      <PageHeader
        title="الضيوف"
        detail={formatGuestCount(guests.length)}
        action={
          canManageGuests ? (
            <Link to={adminPaths.guestNew} className="button button--primary">
              ضيف جديد
            </Link>
          ) : null
        }
      />

      {guests.length === 0 ? (
        <section className="card form-card" role="status">
          <p className="empty-state">
            {canManageGuests
              ? 'لا توجد ملفات ضيوف بعد. أنشئ ملف الضيف الأول.'
              : 'لا توجد ملفات ضيوف.'}
          </p>
        </section>
      ) : (
        <section className="guest-grid" aria-label="دليل الضيوف">
          {guests.map((guest) => {
            const socials = guestSocials.filter((social) => social.guestId === guest.id);
            const appearanceCount = guestAppearances.filter(
              (appearance) => appearance.guestId === guest.id,
            ).length;
            return (
              <article className="card guest-card" key={guest.id}>
                <div className="guest-card__identity">
                  <div className="guest-photo" aria-label={`صورة ${guest.name || 'الضيف'}`} />
                  <div>
                    <Link to={adminPaths.guest(guest.id)} className="text-link guest-card__name">
                      {guest.name || 'ضيف بلا اسم'}
                    </Link>
                    <p className="guest-card__role">{guest.role || 'المسمى غير محدد'}</p>
                  </div>
                </div>

                <p className="guest-card__bio">
                  {guest.bio ||
                    (canManageGuests ? 'لا نبذة بعد. أضفها من ملف الضيف.' : 'لا توجد نبذة.')}
                </p>

                <div className="guest-card__socials" aria-label="حسابات الضيف">
                  {socials.map((social) => (
                    <a
                      key={social.id}
                      href={socialProfileUrl(social)}
                      target="_blank"
                      rel="noreferrer"
                      className="button button--quiet"
                    >
                      {SOCIAL_PLATFORM_LABELS[social.platform]}
                    </a>
                  ))}
                </div>

                <div className="guest-card__footer">
                  <span>{formatGuestAppearanceSummary(appearanceCount)}</span>
                  <Link to={adminPaths.guest(guest.id)} className="button button--quiet">
                    الملف
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
