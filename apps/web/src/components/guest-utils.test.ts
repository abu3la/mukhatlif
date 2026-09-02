import { describe, expect, it } from 'vitest';
import {
  guestAppearanceLabel,
  guestCountLabel,
  guestSocialHref,
  parseGuestSearch,
} from './guest-utils';

describe('guestSocialHref', () => {
  it('normalizes known social handles', () => {
    expect(guestSocialHref({ platform: 'x', handle: '@mukhtalif' })).toBe(
      'https://x.com/mukhtalif',
    );
    expect(guestSocialHref({ platform: 'linkedin', handle: '/in/mukhtalif' })).toBe(
      'https://www.linkedin.com/in/mukhtalif',
    );
    expect(guestSocialHref({ platform: 'website', handle: 'mukhtalif.net' })).toBe(
      'https://mukhtalif.net/',
    );
  });

  it('rejects unsafe or mismatched absolute URLs', () => {
    expect(guestSocialHref({ platform: 'website', handle: 'javascript:alert(1)' })).toBeNull();
    expect(guestSocialHref({ platform: 'x', handle: 'https://example.com/person' })).toBeNull();
    expect(guestSocialHref({ platform: 'youtube', handle: '   ' })).toBeNull();
  });
});

describe('guest copy helpers', () => {
  it('uses Arabic count forms for appearances and directory totals', () => {
    expect(guestAppearanceLabel(0)).toBe('لا حلقات منشورة على يوتيوب');
    expect(guestAppearanceLabel(1)).toBe('ظهر في حلقة واحدة على يوتيوب');
    expect(guestAppearanceLabel(2)).toBe('ظهر في حلقتين على يوتيوب');
    expect(guestAppearanceLabel(6)).toBe('ظهر في ٦ حلقات على يوتيوب');
    expect(guestAppearanceLabel(14)).toBe('ظهر في ١٤ حلقة على يوتيوب');
    expect(guestCountLabel(2)).toBe('ضيفان');
    expect(guestCountLabel(8)).toBe('٨ ضيوف');
  });

  it('normalizes repeated and overlong search input before calling the API', () => {
    expect(parseGuestSearch(['  إدارة   المنتجات  ', 'ignored'])).toBe('إدارة المنتجات');
    expect(parseGuestSearch('x'.repeat(240))).toHaveLength(200);
  });
});
