import { readFileSync } from 'node:fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('NewsletterSignup', () => {
  it('renders stable labels, explicit consent, and an inaccessible honeypot', async () => {
    vi.stubGlobal('React', React);
    const { NewsletterSignup } = await import('./newsletter-signup');
    const html = renderToStaticMarkup(
      React.createElement(NewsletterSignup, { apiOrigin: 'https://api.mukhtalif.example' }),
    );

    expect(html).toContain('النشرة البريدية');
    expect(html).toContain('الاسم الأول');
    expect(html).toContain('البريد الإلكتروني');
    expect(html).toContain('type="email"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain(
      'أوافق على تلقي النشرة البريدية من مختلف، ويمكنني إلغاء الاشتراك في أي وقت.',
    );
    expect(html).toContain('name="companyWebsite"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="newsletter-signup__form"');
    expect(html.match(/class="newsletter-signup"/g)).toHaveLength(1);
  });

  it('keeps the form hooks responsive without duplicating the signup surface', () => {
    const stylesheet = readFileSync(new URL('../app/listener.css', import.meta.url), 'utf8');

    expect(stylesheet).toContain('.newsletter-signup__fields');
    expect(stylesheet).toContain('.newsletter-signup__submit');
    expect(stylesheet).toMatch(
      /@media \(max-width: 620px\) \{[\s\S]*?\.newsletter-signup__submit \{[\s\S]*?inline-size: 100%;/,
    );
  });
});
