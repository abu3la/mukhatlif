import { describe, expect, it } from 'vitest';
import { buildRequestPayload } from './request-form-model';

describe('buildRequestPayload', () => {
  it('carries handoff program, budget and discussion fields into stored request text', () => {
    const data = new FormData();
    data.set('program', 'بترولي');
    data.set('budget', '25 إلى 75 ألف ريال');
    data.set('message', 'تواصل مع أصحاب التجارب');
    expect(buildRequestPayload('sponsorship', data).message).toBe(
      'تواصل مع أصحاب التجارب\n\nالبرنامج: بترولي\n\nالميزانية المقترحة: 25 إلى 75 ألف ريال',
    );
    data.set('topic', 'تجربة تغيير المهنة');
    data.set('notes', 'لديه تجربة تستحق المشاركة');
    expect(buildRequestPayload('guest_suggestion', data).notes).toBe(
      'موضوع الحوار: تجربة تغيير المهنة\n\nلديه تجربة تستحق المشاركة',
    );
  });
  it('normalizes a partnership request and omits blank optional values', () => {
    const data = new FormData();
    data.set('organizationName', '  شركة ألف  ');
    data.set('contactName', ' مها ');
    data.set('email', ' partner@example.com ');
    data.set('phone', ' 0500000000 ');
    data.set('partnershipType', ' شراكة محتوى ');
    data.set('proposal', '  نريد إنتاج سلسلة مشتركة. ');
    data.set('organizationWebsite', '');

    expect(buildRequestPayload('partnership', data)).toEqual({
      organizationName: 'شركة ألف',
      contactName: 'مها',
      email: 'partner@example.com',
      phone: '0500000000',
      partnershipType: 'شراكة محتوى',
      proposal: 'نريد إنتاج سلسلة مشتركة.',
      organizationWebsite: undefined,
    });
  });

  it('converts guest ratings to numbers', () => {
    const data = new FormData();
    data.set('guestName', 'سارة');
    data.set('showName', 'بترولي');
    data.set('overallRating', '5');
    data.set('hostRating', '4');

    expect(buildRequestPayload('guest_review', data)).toMatchObject({
      overallRating: 5,
      hostRating: 4,
    });
  });
});
