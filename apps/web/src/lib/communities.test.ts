import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMMUNITIES,
  NEWSLETTERS,
  PRESENTERS,
  communityLogo,
  programmeCover,
  programmesOf,
} from './communities';

const publicFile = (path: string) =>
  existsSync(fileURLToPath(new URL(`../../public${path}`, import.meta.url).href));
const programmes = COMMUNITIES.flatMap((community) => community.programmes);

describe('communities from the site brief of 9 November 2026', () => {
  it('lists the nine communities and the 27 programmes, without the four excluded ones', () => {
    expect(COMMUNITIES).toHaveLength(9);
    expect(programmes).toHaveLength(27);
    const names = programmes.map((programme) => programme.name);
    for (const excluded of ['سوالف تجارة', 'بيادر', 'فيلمرنت', 'مرقمن']) {
      expect(names).not.toContain(excluded);
    }
    expect(new Set(programmes.map((programme) => programme.slug)).size).toBe(27);
  });

  it('has a local logo and cover for everything it shows', () => {
    for (const community of COMMUNITIES) expect(publicFile(communityLogo(community))).toBe(true);
    for (const programme of programmes) expect(publicFile(programmeCover(programme))).toBe(true);
  });

  it('shows only presenters with an approved bio, each tied to a programme', () => {
    const known = new Set(PRESENTERS.map((presenter) => presenter.slug));
    for (const programme of programmes) {
      for (const slug of programme.presenters) expect(known).toContain(slug);
    }
    for (const presenter of PRESENTERS)
      expect(programmesOf(presenter.slug).length).toBeGreaterThan(0);
    // Excluded by the brief for now; Seera stays without a named presenter.
    expect(PRESENTERS.map((presenter) => presenter.name)).not.toContain('ماجد رشدي');
    expect(programmes.find((programme) => programme.slug === 'seera')?.presenters).toEqual([]);
    expect(programmes.find((programme) => programme.slug === 'gilaf')?.presenters).toEqual([
      'riyadh-alshehri',
    ]);
  });

  it('states a newsletter frequency only where the brief gives one', () => {
    expect(NEWSLETTERS.filter((newsletter) => newsletter.frequency).map((n) => n.slug)).toEqual([
      'petroly',
      'amyal',
    ]);
  });
});
