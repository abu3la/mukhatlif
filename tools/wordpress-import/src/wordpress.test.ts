import { describe, expect, it } from 'vitest';
import { addWordPressRedirectionExport, parseWordPressWxr } from './wordpress.ts';

const author = `
  <wp:author>
    <wp:author_id>1</wp:author_id>
    <wp:author_login><![CDATA[editor]]></wp:author_login>
    <wp:author_email><![CDATA[Editor@Mukhtalif.net]]></wp:author_email>
    <wp:author_display_name><![CDATA[المحرر]]></wp:author_display_name>
    <wp:author_first_name><![CDATA[محمد]]></wp:author_first_name>
    <wp:author_last_name><![CDATA[مختلف]]></wp:author_last_name>
  </wp:author>`;

function meta(key: string, value: string): string {
  return `<wp:postmeta><wp:meta_key><![CDATA[${key}]]></wp:meta_key><wp:meta_value><![CDATA[${value}]]></wp:meta_value></wp:postmeta>`;
}

function item(options: {
  id: number;
  type: string;
  status: string;
  slug: string;
  title?: string;
  extra?: string;
}): string {
  return `<item>
    <title>${options.title ?? `عنوان ${options.id}`}</title>
    <link>https://mukhtalif.net/${options.slug}/</link>
    <pubDate>Tue, 01 Sep 2026 10:00:00 +0000</pubDate>
    <dc:creator><![CDATA[editor]]></dc:creator>
    <guid isPermaLink="false">https://mukhtalif.net/?p=${options.id}</guid>
    <content:encoded><![CDATA[<p>المحتوى ${options.id}</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[ملخص ${options.id}]]></excerpt:encoded>
    <wp:post_id>${options.id}</wp:post_id>
    <wp:post_date_gmt>2026-09-01 10:00:00</wp:post_date_gmt>
    <wp:post_modified_gmt>2026-09-01 11:00:00</wp:post_modified_gmt>
    <wp:post_name><![CDATA[${options.slug}]]></wp:post_name>
    <wp:status><![CDATA[${options.status}]]></wp:status>
    <wp:post_parent>0</wp:post_parent>
    <wp:menu_order>0</wp:menu_order>
    <wp:post_type><![CDATA[${options.type}]]></wp:post_type>
    ${options.extra ?? ''}
  </item>`;
}

function wxr(items: string): string {
  return `<?xml version="1.0"?><rss xmlns:excerpt="x" xmlns:content="x" xmlns:dc="x" xmlns:wp="x">
    <!-- generator="WordPress/6.8.6" created="2026-09-02 10:07" -->
    <channel>
      <title>مختلف</title><link>https://mukhtalif.net</link><description>وصف</description>
      <pubDate>Wed, 02 Sep 2026 10:07:43 +0000</pubDate><language>ar</language>
      <wp:wxr_version>1.2</wp:wxr_version><wp:base_site_url>https://mukhtalif.net</wp:base_site_url>
      <wp:base_blog_url>https://mukhtalif.net</wp:base_blog_url>${author}${items}
    </channel></rss>`;
}

describe('WordPress WXR manifest', () => {
  it('selects publishable core records, retains deferred records, and captures migration fields', () => {
    const source = wxr(
      item({
        id: 10,
        type: 'post',
        status: 'publish',
        slug: 'career-story',
        extra: `${meta('_thumbnail_id', '99')}${meta('_wp_old_slug', 'old-story')}${meta(
          '_yoast_wpseo_metadesc',
          'وصف البحث',
        )}${meta('_elementor_data', '[{"id":"hero"}]')}<category domain="category" nicename="career"><![CDATA[المهن]]></category>`,
      }) +
        item({ id: 11, type: 'post', status: 'draft', slug: 'draft-story' }) +
        item({
          id: 20,
          type: 'team_member',
          status: 'publish',
          slug: '%d9%85%d8%ad%d9%85%d8%af',
          extra: `${meta('member_name', 'محمد مختلف')}${meta('member_position', 'محرر')}`,
        }) +
        item({
          id: 30,
          type: 'book',
          status: 'publish',
          slug: 'atomic-habits',
          extra: `${meta('book_name', 'العادات الذرية')}${meta('Book_Description', '<p>كتاب</p>')}`,
        }) +
        item({
          id: 99,
          type: 'attachment',
          status: 'inherit',
          slug: 'cover',
          extra: `${meta('_wp_attached_file', '2026/cover.jpg')}<wp:attachment_url><![CDATA[https://mukhtalif.net/wp-content/uploads/2026/cover.jpg]]></wp:attachment_url>`,
        }) +
        item({
          id: 50,
          type: 'revision',
          status: 'inherit',
          slug: 'revision',
          extra: meta('_wp_old_slug', 'old-revision'),
        }),
    );
    const manifest = parseWordPressWxr(source, { sourceFile: '/backup/wordpress.xml' });

    expect(manifest.authors).toHaveLength(1);
    expect(manifest.authors[0].email).toBe('editor@mukhtalif.net');
    expect(manifest.candidates.post).toHaveLength(1);
    expect(manifest.candidates.team_member).toHaveLength(1);
    expect(manifest.candidates.book).toHaveLength(1);
    expect(manifest.candidates.attachment).toHaveLength(1);
    expect(manifest.deferred.map((record) => record.legacyId)).toEqual([11]);
    expect(manifest.ignored.byPostType).toEqual({ revision: 1 });

    const post = manifest.candidates.post[0];
    expect(post.featuredMediaLegacyId).toBe(99);
    expect(post.seo.description).toBe('وصف البحث');
    expect(post.terms).toEqual([{ domain: 'category', slug: 'career', label: 'المهن' }]);
    expect(post.builder?.data).toBe('[{"id":"hero"}]');
    expect(post.contentHtml).toBe('<p>المحتوى 10</p>');
    expect(manifest.candidates.team_member[0].suggestedTargetSlug).toBe('legacy-team-member-20');
    expect(manifest.proposedRedirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePath: '/old-story/',
          destination: '/articles/career-story/',
          reason: 'old-slug',
        }),
        expect.objectContaining({
          legacyRecordType: 'revision',
          legacyRecordId: 50,
          sourcePath: '/old-revision/',
          destination: '/revision/',
          enabled: false,
          requiresReview: true,
        }),
      ]),
    );
  });

  it('keeps CDATA content that resembles an XML closing tag and produces stable checksums', () => {
    const source = wxr(
      item({
        id: 1,
        type: 'post',
        status: 'publish',
        slug: 'xml-edge',
        extra: meta('_elementor_data', '[{"html":"</item>"}]'),
      }),
    );
    const first = parseWordPressWxr(source, { sourceFile: '/same.xml' });
    const second = parseWordPressWxr(source, { sourceFile: '/same.xml' });
    expect(first.candidates.post[0].builder?.data).toContain('</item>');
    expect(first.checksumSha256).toBe(second.checksumSha256);
  });

  it('adds exact Redirection plugin exports without discarding external or temporary targets', () => {
    const manifest = parseWordPressWxr(wxr(''), { sourceFile: '/backup.xml' });
    const merged = addWordPressRedirectionExport(manifest, {
      redirects: [
        {
          id: 7,
          url: '/campaign',
          action_code: 302,
          action_type: 'url',
          action_data: { url: 'https://example.com/landing' },
          enabled: true,
          regex: false,
        },
        {
          id: 8,
          url: '/نشرة-أميال/',
          action_code: 301,
          action_type: 'url',
          action_data: { url: '/amyalnl/' },
          enabled: true,
          regex: false,
        },
      ],
    });
    expect(merged.proposedRedirects).toContainEqual({
      source: 'wordpress-redirection',
      legacyRecordType: null,
      legacyRecordId: null,
      sourcePath: '/campaign/',
      destination: 'https://example.com/landing',
      reason: 'plugin-export',
      statusCode: 302,
      enabled: true,
      requiresReview: false,
      pluginRedirectId: 7,
    });
    expect(merged.proposedRedirects).toContainEqual(
      expect.objectContaining({
        sourcePath: '/%D9%86%D8%B4%D8%B1%D8%A9-%D8%A3%D9%85%D9%8A%D8%A7%D9%84/',
        destination: '/amyalnl/',
        pluginRedirectId: 8,
      }),
    );
  });
});
