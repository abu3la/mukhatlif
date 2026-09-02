import Link from 'next/link';
import type { PublicGuest } from '@mukhtalif/types';
import { guestAppearanceLabel } from './guest-utils';

function guestInitial(name: string): string {
  return Array.from(name.trim())[0] ?? 'م';
}

export function GuestPortrait({
  guest,
  className,
  decorative = false,
  eager = false,
}: {
  guest: Pick<PublicGuest, 'name' | 'photoUrl'>;
  className: string;
  decorative?: boolean;
  eager?: boolean;
}) {
  if (guest.photoUrl) {
    return (
      <img
        className={className}
        src={guest.photoUrl}
        alt={decorative ? '' : `صورة ${guest.name}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span className={`${className} guest-portrait--fallback`} aria-hidden="true">
      {guestInitial(guest.name)}
    </span>
  );
}

export function GuestCard({ guest }: { guest: PublicGuest }) {
  const details = [guest.role, guest.city].filter(Boolean).join('، ');

  return (
    <Link
      className="guest-card"
      href={`/guests/${encodeURIComponent(guest.slug)}`}
      aria-label={`صفحة الضيف ${guest.name}`}
    >
      <GuestPortrait guest={guest} className="guest-card__portrait" decorative />
      <span className="guest-card__body">
        <span className="guest-card__identity">
          <span className="guest-card__name">{guest.name}</span>
          {details ? <span className="guest-card__role">{details}</span> : null}
        </span>
        <span className="guest-card__appearances">
          {guestAppearanceLabel(guest.episodeCount)}
        </span>
      </span>
    </Link>
  );
}
