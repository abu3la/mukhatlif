import Link from 'next/link';

/** What a programme tile shows, worked out on the server so a client list stays light. */
export interface ProgrammeTileData {
  slug: string;
  name: string;
  description: string;
  /** «تقديم …», empty while the presenter is unconfirmed. */
  hosts: string;
  href: string;
  cover: string;
  tone: 'dark' | 'light';
}

/** A programme as the rails and the directory show it: the whole cover, its name, approved line and hosts. */
export function ProgrammeTileView({
  programme,
  className,
}: {
  programme: ProgrammeTileData;
  className?: string;
}) {
  return (
    <li
      className={'programme-tile' + (className ? ` ${className}` : '')}
      data-tone={programme.tone}
    >
      <Link className="programme-tile__link" href={programme.href}>
        <img
          className="programme-tile__cover"
          src={programme.cover}
          alt=""
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
        />
        <span className="programme-tile__name">{programme.name}</span>
        <span className="programme-tile__text">{programme.description}</span>
        {/* The hosts line keeps its height when a presenter is not confirmed yet. */}
        <span className="programme-tile__hosts" aria-hidden={!programme.hosts}>
          {programme.hosts || ' '}
        </span>
      </Link>
    </li>
  );
}
