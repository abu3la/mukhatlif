'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MANIFESTO } from '@/lib/site-facts';

/** Phrases lit before any scrolling, and without JavaScript. Every phrase is readable either way. */
const LIT_AT_REST = 2;

/**
 * «قضيتنا», lit phrase by phrase as it crosses the screen (D-24). Unlit
 * phrases stay readable in `--mk-stage-ink-unlit`; the scroll only changes
 * their colour, never whether they are there.
 */
export function HomeManifesto() {
  const text = useRef<HTMLParagraphElement>(null);
  const [lit, setLit] = useState(LIT_AT_REST);

  useEffect(() => {
    const node = text.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLit(MANIFESTO.length);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = node.getBoundingClientRect();
      const view = window.innerHeight;
      const progress = Math.min(
        1,
        Math.max(0, (view * 0.82 - box.top) / (box.height + view * 0.3)),
      );
      setLit(Math.round(progress * MANIFESTO.length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section className="home-manifesto" aria-labelledby="home-manifesto-title">
      <svg
        className="home-manifesto__route"
        viewBox="0 0 40 140"
        aria-hidden="true"
        focusable="false"
      >
        <path className="home-manifesto__line" d="M20 0V112" />
        <path className="home-manifesto__stop" d="M20 104 33 117 20 130 7 117Z" />
      </svg>
      <div className="content-container home-manifesto__body">
        <h2 id="home-manifesto-title" className="visually-hidden">
          قضيتنا
        </h2>
        <p ref={text} className="home-manifesto__text">
          {MANIFESTO.map((phrase, index) => (
            <span key={phrase} className={index < lit ? 'is-lit' : undefined}>
              {phrase}
              {index < MANIFESTO.length - 1 ? ' ' : null}
            </span>
          ))}
        </p>
        <Link className="stage-link" href="/mission">
          اقرأ قضيتنا
        </Link>
      </div>
    </section>
  );
}
