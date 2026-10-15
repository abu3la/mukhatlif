import type { SVGProps } from 'react';

const marks = {
  clock:
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16m-1 2h2v5.5l4 2-1 1.8-5-2.8z',
  level: 'M3 15h4v6H3zm7-6h4v12h-4zm7-6h4v18h-4z',
  filter: 'M3 5h18v2H3zm3 6h12v2H6zm3 6h6v2H9z',

  previous: 'm13 4 8 8-8 8-1.5-1.5L17 13H3v-2h14l-5.5-5.5z',
  next: 'm11 4 1.5 1.5L7 11h14v2H7l5.5 5.5L11 20l-8-8z',
  document: 'M5 2h9l5 5v15H5zm2 2v16h10V9h-5V4zm7 1v2h2zM9 12h6v2H9zm0 4h6v2H9z',
  check: 'm4 11 5 5L20 5l1.5 1.5L9 19 2.5 12.5z',
  certificate: 'M3 3h18v13h-5v6l-4-2-4 2v-6H3zm2 2v9h3v-3h8v3h3V5zm5 8v6l2-1 2 1v-6z',

  search:
    'M10 3a7 7 0 1 0 4.8 12.1l5.4 5.4 1.5-1.5-5.4-5.4A7 7 0 0 0 10 3m0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10',
  library: 'M3 3h4v18H3zm6 0h4v18H9zm6 1 4-1 4 17-4 1z',
  user: 'M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10M3 22v-2a9 7 0 0 1 18 0v2z',
  menu: 'M3 5h18v2H3zm0 6h18v2H3zm0 6h12v2H3z',
  close:
    'm5.7 4.3 6.3 6.3 6.3-6.3 1.4 1.4-6.3 6.3 6.3 6.3-1.4 1.4-6.3-6.3-6.3 6.3-1.4-1.4 6.3-6.3-6.3-6.3z',
  queue: 'M3 4h18v2H3zm0 6h12v2H3zm0 6h9v2H3zm14-4 6 4-6 4z',
  save: 'M6 3h12v19l-6-4-6 4V3m2 2v13.3l4-2.7 4 2.7V5z',
  saved: 'M6 3h12v19l-6-4-6 4z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z',
  up: 'M12 5l7 7-1.4 1.4L13 8.8V19h-2V8.8l-4.6 4.6L5 12z',
  down: 'M12 19l-7-7 1.4-1.4 4.6 4.6V5h2v10.2l4.6-4.6L19 12z',
  play: 'M7 4.8v14.4L19 12z',
} as const;
export function BrandIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof marks }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path fillRule="evenodd" d={marks[name]} />
    </svg>
  );
}
