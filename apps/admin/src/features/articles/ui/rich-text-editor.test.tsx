import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleMediaAsset } from '@/data';
import {
  isAllowedArticleLink,
  normalizeArticleDocument,
  RichTextEditor,
  type RichTextValue,
} from './rich-text-editor';

const DOCUMENT = {
  type: 'doc' as const,
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'نص تجريبي' }],
    },
  ],
};

describe('RichTextEditor', () => {
  afterEach(cleanup);

  it('keeps persisted link data inside the safe schema', () => {
    expect(
      normalizeArticleDocument({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'مختلف',
                marks: [
                  {
                    type: 'link',
                    attrs: {
                      href: 'https://mukhtalif.com',
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      class: null,
                      title: null,
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'مختلف',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    href: 'https://mukhtalif.com',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  },
                },
              ],
            },
          ],
        },
      ],
    });
  });

  it('keeps only canonical image, gallery, and video placement attributes', () => {
    expect(
      normalizeArticleDocument({
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: {
              mediaId: 'med-00000000000000000000000000000001',
              alt: 'غلاف الحلقة',
              caption: 'تعليق الصورة',
              presentation: 'wide',
              alignment: 'end',
              radius: 'round',
              src: 'https://untrusted.example/image.png',
              style: 'position:fixed',
            },
          },
          {
            type: 'imageGallery',
            attrs: {
              items: [
                {
                  mediaId: 'med-00000000000000000000000000000001',
                  alt: 'الصورة الأولى',
                  style: 'position:fixed',
                },
                {
                  mediaId: '',
                  alt: 'معرّف فارغ',
                },
                {
                  mediaId: 'med-00000000000000000000000000000001',
                  alt: 'نسخة مكررة',
                },
                {
                  mediaId: 'med-00000000000000000000000000000002',
                  alt: '',
                },
              ],
              caption: '  وصف المجموعة  ',
              columns: 8,
            },
          },
          {
            type: 'videoEmbed',
            attrs: {
              provider: 'youtube',
              videoId: 'dQw4w9WgXcQ',
              title: 'مستقبل العمل',
              posterMediaId: 'med-00000000000000000000000000000001',
              caption: 'حوار الأسبوع',
              iframe: '<iframe></iframe>',
            },
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'imageBlock',
          attrs: {
            mediaId: 'med-00000000000000000000000000000001',
            alt: 'غلاف الحلقة',
            caption: 'تعليق الصورة',
            presentation: 'wide',
            alignment: 'end',
            radius: 'round',
          },
        },
        {
          type: 'imageGallery',
          attrs: {
            items: [
              {
                mediaId: 'med-00000000000000000000000000000001',
                alt: 'الصورة الأولى',
              },
              {
                mediaId: 'med-00000000000000000000000000000002',
                alt: '',
              },
            ],
            caption: 'وصف المجموعة',
          },
        },
        {
          type: 'videoEmbed',
          attrs: {
            provider: 'youtube',
            videoId: 'dQw4w9WgXcQ',
            title: 'مستقبل العمل',
            posterMediaId: 'med-00000000000000000000000000000001',
            caption: 'حوار الأسبوع',
          },
        },
      ],
    });
  });

  it('uses safe image design defaults for legacy article content', () => {
    expect(
      normalizeArticleDocument({
        type: 'doc',
        content: [
          {
            type: 'imageBlock',
            attrs: {
              mediaId: 'med-00000000000000000000000000000001',
              alt: 'صورة قديمة',
              presentation: 'content',
              alignment: 'unsupported',
              radius: '20px',
            },
          },
        ],
      }).content?.[0]?.attrs,
    ).toEqual({
      mediaId: 'med-00000000000000000000000000000001',
      alt: 'صورة قديمة',
      presentation: 'content',
      alignment: 'center',
      radius: 'none',
    });
  });

  it('keeps only canonical text-section layout attributes', () => {
    expect(
      normalizeArticleDocument({
        type: 'doc',
        content: [
          {
            type: 'textSection',
            attrs: {
              alignment: 'justify',
              direction: 'ltr',
              vertical: 'bottom',
              height: 'tall',
              style: 'position:fixed',
              class: 'untrusted',
            },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Weekly brief' }] }],
          },
        ],
      }),
    ).toEqual({
      type: 'doc',
      content: [
        {
          type: 'textSection',
          attrs: {
            alignment: 'justify',
            direction: 'ltr',
            vertical: 'bottom',
            height: 'tall',
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Weekly brief' }] }],
        },
      ],
    });
  });

  it('repairs legacy automatic-height sections with inactive vertical alignment', () => {
    expect(
      normalizeArticleDocument({
        type: 'doc',
        content: [
          {
            type: 'textSection',
            attrs: {
              alignment: 'start',
              direction: 'rtl',
              vertical: 'bottom',
              height: 'auto',
            },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص قديم' }] }],
          },
        ],
      }).content?.[0]?.attrs,
    ).toEqual({
      alignment: 'start',
      direction: 'rtl',
      vertical: 'top',
      height: 'auto',
    });
  });

  it('accepts only the same explicit link allowlist as the API', () => {
    expect(isAllowedArticleLink('https://mukhtalif.com/article')).toBe(true);
    expect(isAllowedArticleLink('mailto:hello@mukhtalif.com')).toBe(true);
    expect(isAllowedArticleLink('/articles/weekly')).toBe(true);
    expect(isAllowedArticleLink('/')).toBe(true);
    expect(isAllowedArticleLink('#section')).toBe(true);
    expect(isAllowedArticleLink('#')).toBe(true);
    expect(isAllowedArticleLink('//evil.example')).toBe(false);
    expect(isAllowedArticleLink('http://insecure.example')).toBe(false);
    expect(isAllowedArticleLink('https://user:secret@example.com')).toBe(false);
    expect(isAllowedArticleLink('tel:+966500000000')).toBe(false);
  });

  it('applies headings, lists, quotes, and undo-redo through working toolbar controls', async () => {
    const user = userEvent.setup();
    const changes: RichTextValue[] = [];
    render(<RichTextEditor initialDocument={DOCUMENT} onChange={(value) => changes.push(value)} />);

    const textbox = screen.getByRole('textbox', { name: 'محتوى المقال' });
    await user.click(textbox);
    await user.click(screen.getByRole('button', { name: 'عنوان 2' }));
    expect(changes.at(-1)?.document.content?.[0]?.type).toBe('heading');
    expect(changes.at(-1)?.document.content?.[0]?.attrs?.level).toBe(2);

    await user.click(screen.getByRole('button', { name: 'نص' }));
    await user.click(screen.getByRole('button', { name: 'نقاط' }));
    expect(changes.at(-1)?.document.content?.[0]?.type).toBe('bulletList');

    await user.click(screen.getByRole('button', { name: 'نقاط' }));
    await user.click(screen.getByRole('button', { name: 'ترقيم' }));
    expect(changes.at(-1)?.document.content?.[0]?.type).toBe('orderedList');

    await user.click(screen.getByRole('button', { name: 'ترقيم' }));
    await user.click(screen.getByRole('button', { name: 'اقتباس' }));
    expect(changes.at(-1)?.document.content?.[0]?.type).toBe('blockquote');

    await user.click(screen.getByRole('button', { name: 'تراجع' }));
    expect(changes.at(-1)?.document.content?.[0]?.type).toBe('paragraph');
    await user.click(screen.getByRole('button', { name: 'إعادة' }));
    expect(changes.at(-1)?.document.content?.[0]?.type).toBe('blockquote');
  });

  it('renders the formatting toolbar as accessible icon-only controls', () => {
    render(<RichTextEditor initialDocument={DOCUMENT} onChange={vi.fn()} />);

    const toolbar = screen.getByRole('toolbar', { name: 'تنسيق المحتوى' });
    const labels = [
      'نص',
      'عنوان 2',
      'عنوان 3',
      'عريض',
      'مائل',
      'نقاط',
      'ترقيم',
      'اقتباس',
      'رابط',
      'إزالة الرابط',
      'رفع صورة',
      'معرض صور',
      'فيديو',
      'تراجع',
      'إعادة',
    ];

    for (const label of labels) {
      const button = screen.getByRole('button', { name: label });
      expect(toolbar).toContainElement(button);
      expect(button).toHaveAttribute('title', label);
      expect(button.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
      expect(button).toHaveTextContent('');
    }
    for (const { label, title } of [
      { label: 'محاذاة النص', title: 'محاذاة النص: يمين' },
      { label: 'اتجاه النص', title: 'اتجاه النص: من اليمين إلى اليسار' },
    ]) {
      const trigger = screen.getByRole('button', { name: label });
      expect(toolbar).toContainElement(trigger);
      expect(trigger).toHaveAttribute('title', title);
      expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
      expect(trigger).toHaveTextContent('');
    }
    expect(screen.getByRole('button', { name: 'نص' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'عريض' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'إزالة الرابط' })).toBeDisabled();
  });

  it('applies bold and italic marks to selected text', async () => {
    const user = userEvent.setup();
    const changes: RichTextValue[] = [];
    render(<RichTextEditor initialDocument={DOCUMENT} onChange={(value) => changes.push(value)} />);

    const textbox = screen.getByRole('textbox', { name: 'محتوى المقال' });
    await user.click(textbox);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'عريض' }));
    await user.click(screen.getByRole('button', { name: 'مائل' }));

    const marks = changes.at(-1)?.document.content?.[0]?.content?.[0]?.marks;
    expect(marks?.map((mark) => mark.type)).toEqual(expect.arrayContaining(['bold', 'italic']));
  });

  it('wraps text through icon-only alignment and direction menus', async () => {
    const user = userEvent.setup();
    const changes: RichTextValue[] = [];
    const { container } = render(
      <RichTextEditor initialDocument={DOCUMENT} onChange={(value) => changes.push(value)} />,
    );

    await user.click(screen.getByRole('textbox', { name: 'محتوى المقال' }));
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByText('ارتفاع القسم')).not.toBeInTheDocument();
    expect(screen.queryByText('المحاذاة الرأسية')).not.toBeInTheDocument();

    const alignmentTrigger = screen.getByRole('button', { name: 'محاذاة النص' });
    await user.click(alignmentTrigger);
    const alignmentMenu = screen.getByRole('menu', { name: 'محاذاة النص' });
    expect(alignmentTrigger).toHaveAttribute('aria-expanded', 'true');
    const alignmentChoices = ['يمين', 'وسط', 'يسار', 'ضبط'];
    for (const label of alignmentChoices) {
      const choice = screen.getByRole('menuitemradio', { name: label });
      expect(alignmentMenu).toContainElement(choice);
      expect(choice).toHaveAttribute('title', label);
      expect(choice.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
      expect(choice).toHaveTextContent('');
    }
    expect(screen.getByRole('menuitemradio', { name: 'يمين' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'وسط' }));
    await waitFor(() => expect(alignmentTrigger).toHaveFocus());
    expect(alignmentTrigger).toHaveAttribute('aria-expanded', 'false');

    const directionTrigger = screen.getByRole('button', { name: 'اتجاه النص' });
    await user.click(directionTrigger);
    const directionMenu = screen.getByRole('menu', { name: 'اتجاه النص' });
    for (const label of ['من اليمين إلى اليسار', 'من اليسار إلى اليمين']) {
      const choice = screen.getByRole('menuitemradio', { name: label });
      expect(directionMenu).toContainElement(choice);
      expect(choice).toHaveTextContent('');
    }
    await user.click(screen.getByRole('menuitemradio', { name: 'من اليسار إلى اليمين' }));
    await waitFor(() => expect(directionTrigger).toHaveFocus());
    await user.click(alignmentTrigger);
    await user.click(screen.getByRole('menuitemradio', { name: 'يمين' }));

    expect(changes.at(-1)?.document.content?.[0]).toEqual({
      type: 'textSection',
      attrs: {
        alignment: 'end',
        direction: 'ltr',
        vertical: 'top',
        height: 'auto',
      },
      content: DOCUMENT.content,
    });
    const section = container.querySelector('section[data-article-text-section]');
    expect(section).toHaveAttribute('dir', 'ltr');
    expect(section).toHaveClass('article-text-section--align-end');
    expect(alignmentTrigger.querySelector('svg.lucide-text-align-end')).toBeInTheDocument();
    expect(directionTrigger.querySelector('svg.lucide-pilcrow-left')).toBeInTheDocument();
  });

  it('closes toolbar menus on Escape, outside click, Tab, and when another menu opens', async () => {
    const user = userEvent.setup();
    render(<RichTextEditor initialDocument={DOCUMENT} onChange={vi.fn()} />);
    const textbox = screen.getByRole('textbox', { name: 'محتوى المقال' });
    await user.click(textbox);
    const alignmentTrigger = screen.getByRole('button', { name: 'محاذاة النص' });
    const directionTrigger = screen.getByRole('button', { name: 'اتجاه النص' });

    await user.click(alignmentTrigger);
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'يمين' })).toHaveFocus());
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: 'وسط' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'محاذاة النص' })).not.toBeInTheDocument();
    expect(alignmentTrigger).toHaveFocus();

    await user.click(alignmentTrigger);
    await user.click(directionTrigger);
    expect(screen.queryByRole('menu', { name: 'محاذاة النص' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu', { name: 'اتجاه النص' })).toBeInTheDocument();

    await user.click(textbox);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(alignmentTrigger);
    await waitFor(() => expect(screen.getByRole('menuitemradio', { name: 'يمين' })).toHaveFocus());
    await user.tab();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('preserves legacy height and vertical attributes when toolbar layout changes', async () => {
    const user = userEvent.setup();
    const changes: RichTextValue[] = [];
    render(
      <RichTextEditor
        initialDocument={{
          type: 'doc',
          content: [
            {
              type: 'textSection',
              attrs: {
                alignment: 'start',
                direction: 'rtl',
                vertical: 'bottom',
                height: 'tall',
              },
              content: DOCUMENT.content,
            },
          ],
        }}
        onChange={(value) => changes.push(value)}
      />,
    );

    await user.click(screen.getByRole('textbox', { name: 'محتوى المقال' }));
    await user.click(screen.getByRole('button', { name: 'اتجاه النص' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'من اليسار إلى اليمين' }));
    expect(changes.at(-1)?.document.content?.[0]?.attrs).toEqual({
      alignment: 'start',
      direction: 'ltr',
      vertical: 'bottom',
      height: 'tall',
    });
  });

  it('does not apply text-section controls to media nodes', () => {
    render(
      <RichTextEditor
        initialDocument={{
          type: 'doc',
          content: [
            {
              type: 'imageBlock',
              attrs: {
                mediaId: 'med-00000000000000000000000000000001',
                alt: 'صورة المقال',
                presentation: 'content',
                alignment: 'center',
                radius: 'none',
              },
            },
          ],
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'محاذاة النص' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'اتجاه النص' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'محاذاة النص' })).toHaveAttribute(
      'title',
      'حدد نصًا لتغيير التنسيق',
    );
  });

  it.each([
    {
      context: 'اقتباس',
      content: [
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'نص مقتبس' }],
            },
          ],
        },
      ],
    },
    {
      context: 'قائمة',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'عنصر في القائمة' }],
                },
              ],
            },
          ],
        },
      ],
    },
  ])('does not create an invalid text section inside a $context', ({ content }) => {
    render(<RichTextEditor initialDocument={{ type: 'doc', content }} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'محاذاة النص' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'اتجاه النص' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'محاذاة النص' })).toHaveAttribute(
      'title',
      'التنسيق متاح للفقرات والعناوين المستقلة',
    );
  });

  it('applies a link with Enter without submitting its outer article form', async () => {
    const user = userEvent.setup();
    const submit = vi.fn<(event: React.FormEvent<HTMLFormElement>) => void>((event) => {
      event.preventDefault();
    });
    const changes: RichTextValue[] = [];
    render(
      <form onSubmit={submit}>
        <RichTextEditor initialDocument={DOCUMENT} onChange={(value) => changes.push(value)} />
      </form>,
    );

    const textbox = screen.getByRole('textbox', { name: 'محتوى المقال' });
    await user.click(textbox);
    await user.keyboard('{Control>}a{/Control}');
    await user.click(screen.getByRole('button', { name: 'رابط' }));
    const linkInput = screen.getByRole('textbox', { name: 'رابط النص المحدد' });
    await user.type(linkInput, 'https://mukhtalif.com/weekly{Enter}');

    expect(submit).not.toHaveBeenCalled();
    expect(changes.at(-1)?.document.content?.[0]?.content?.[0]?.marks).toEqual([
      expect.objectContaining({
        type: 'link',
        attrs: expect.objectContaining({ href: 'https://mukhtalif.com/weekly' }),
      }),
    ]);
    expect(screen.getByRole('button', { name: 'إزالة الرابط' })).toBeInTheDocument();
  });

  it('restores focus to the exact video control after closing its media dialog', async () => {
    const user = userEvent.setup();
    render(
      <RichTextEditor
        initialDocument={DOCUMENT}
        mediaAssets={[]}
        refreshMedia={vi.fn(async () => undefined)}
        uploadImage={vi.fn(async () => {
          throw new Error('Not used.');
        })}
        onChange={vi.fn()}
      />,
    );

    const videoButton = screen.getByRole('button', { name: 'فيديو' });
    await user.click(videoButton);
    expect(screen.getByRole('dialog', { name: 'إضافة فيديو' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'إضافة فيديو' })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(videoButton).toHaveFocus());
  });

  it('inserts a library image with contextual alternative text', async () => {
    const user = userEvent.setup();
    const changes: RichTextValue[] = [];
    const asset: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000001',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'weekly-cover.png',
      byteSize: 4000,
      width: 1200,
      height: 800,
      defaultAlt: 'صورة افتراضية',
      status: 'ready',
      publicUrl: 'data:image/png;base64,AAAA',
      createdAt: '2026-08-17T12:00:00.000Z',
    };
    render(
      <RichTextEditor
        initialDocument={DOCUMENT}
        mediaAssets={[asset]}
        refreshMedia={vi.fn(async () => undefined)}
        uploadImage={vi.fn(async () => asset)}
        onChange={(value) => changes.push(value)}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'رفع صورة' }));
    await user.click(screen.getByRole('option', { name: /weekly-cover\.png/ }));
    const alt = screen.getByRole('textbox', { name: /^الوصف البديل/ });
    await user.clear(alt);
    await user.type(alt, 'المتحدث أمام ميكروفون مختلف');
    await user.selectOptions(screen.getByRole('combobox', { name: /^محاذاة الصورة/ }), 'end');
    await user.selectOptions(screen.getByRole('combobox', { name: 'حواف الصورة' }), 'round');
    await user.click(screen.getByRole('button', { name: 'إدراج الصورة' }));

    expect(changes.at(-1)?.document.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'imageBlock',
          attrs: expect.objectContaining({
            mediaId: asset.id,
            alt: 'المتحدث أمام ميكروفون مختلف',
            alignment: 'end',
            radius: 'round',
          }),
        }),
      ]),
    );
    expect(screen.getByAltText('المتحدث أمام ميكروفون مختلف').closest('figure')).toHaveClass(
      'article-media-node--align-end',
      'article-media-node--radius-round',
    );
  });

  it('inserts a two-image gallery and restores focus to its known toolbar icon', async () => {
    const user = userEvent.setup();
    const changes: RichTextValue[] = [];
    const assets = [
      {
        id: 'med-00000000000000000000000000000001',
        kind: 'image' as const,
        mimeType: 'image/png' as const,
        fileName: 'first.png',
        byteSize: 4_000,
        width: 1_200,
        height: 800,
        defaultAlt: 'الصورة الأولى',
        status: 'ready' as const,
        publicUrl: 'data:image/png;base64,FIRST',
        createdAt: '2026-08-18T08:00:00.000Z',
      },
      {
        id: 'med-00000000000000000000000000000002',
        kind: 'image' as const,
        mimeType: 'image/png' as const,
        fileName: 'second.png',
        byteSize: 4_000,
        width: 900,
        height: 1_200,
        defaultAlt: 'الصورة الثانية',
        status: 'ready' as const,
        publicUrl: 'data:image/png;base64,SECOND',
        createdAt: '2026-08-18T08:00:00.000Z',
      },
    ];
    render(
      <RichTextEditor
        initialDocument={DOCUMENT}
        mediaAssets={assets}
        refreshMedia={vi.fn(async () => undefined)}
        uploadImage={vi.fn(async () => assets[0]!)}
        onChange={(value) => changes.push(value)}
      />,
    );

    const galleryButton = screen.getByRole('button', { name: 'معرض صور' });
    await user.click(galleryButton);
    await user.click(screen.getByRole('option', { name: 'first.png' }));
    await user.click(screen.getByRole('option', { name: 'second.png' }));
    await user.type(
      screen.getByRole('textbox', { name: /^وصف المجموعة \(اختياري\)/ }),
      'مشهدان من الاستوديو',
    );
    const commit = screen.getByRole('button', { name: 'إضافة المعرض' });
    expect(commit).toBeEnabled();
    expect(commit).toHaveClass('button--primary');
    await user.click(commit);

    expect(changes.at(-1)?.document.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'imageGallery',
          attrs: {
            items: [
              { mediaId: assets[0].id, alt: 'الصورة الأولى' },
              { mediaId: assets[1].id, alt: 'الصورة الثانية' },
            ],
            caption: 'مشهدان من الاستوديو',
          },
        }),
      ]),
    );
    expect(screen.getByAltText('الصورة الأولى')).toBeInTheDocument();
    expect(screen.getByAltText('الصورة الثانية')).toBeInTheDocument();
    expect(screen.getByText('مشهدان من الاستوديو')).toBeVisible();
    await waitFor(() => expect(galleryButton).toHaveFocus());
  });

  it.each([
    [
      'اقتباس',
      {
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص اقتباس' }] }],
          },
        ],
      },
    ],
    [
      'قائمة',
      {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'عنصر قائمة' }] }],
              },
            ],
          },
        ],
      },
    ],
  ])('keeps gallery insertion outside a %s', async (_label, document) => {
    const user = userEvent.setup();
    render(
      <RichTextEditor
        initialDocument={document}
        mediaAssets={[]}
        refreshMedia={vi.fn(async () => undefined)}
        uploadImage={vi.fn(async () => {
          throw new Error('Not used.');
        })}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('textbox', { name: 'محتوى المقال' }));
    const galleryButton = screen.getByRole('button', {
      name: 'أضف المعرض بين فقرات المقال',
    });
    expect(galleryButton).toBeDisabled();
    expect(galleryButton).toHaveAttribute('title', 'أضف المعرض بين فقرات المقال');
  });

  it.each([
    ['29 صورة', 27, 1],
    ['30 صورة', 28, 0],
  ])('counts gallery items toward the article limit at %s', async (_label, singles, expectedSlots) => {
    const user = userEvent.setup();
    const sharedAsset: ArticleMediaAsset = {
      id: 'med-00000000000000000000000000000001',
      kind: 'image',
      mimeType: 'image/png',
      fileName: 'limit.png',
      byteSize: 4_000,
      width: 1_200,
      height: 800,
      defaultAlt: 'صورة الحد',
      status: 'ready',
      publicUrl: 'data:image/png;base64,LIMIT',
      createdAt: '2026-08-18T08:00:00.000Z',
    };
    const document = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'موضع المعرض' }] },
        ...Array.from({ length: singles }, () => ({
          type: 'imageBlock',
          attrs: {
            mediaId: sharedAsset.id,
            alt: 'صورة مفردة',
            presentation: 'content',
            alignment: 'center',
            radius: 'none',
          },
        })),
        {
          type: 'imageGallery',
          attrs: {
            items: [
              { mediaId: sharedAsset.id, alt: 'الصورة الأولى' },
              {
                mediaId: 'med-00000000000000000000000000000002',
                alt: 'الصورة الثانية',
              },
            ],
          },
        },
      ],
    };
    render(
      <RichTextEditor
        initialDocument={document}
        mediaAssets={[sharedAsset]}
        refreshMedia={vi.fn(async () => undefined)}
        uploadImage={vi.fn(async () => sharedAsset)}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'معرض صور' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'لا توجد مساحة لصورتين جديدتين. أزل صورًا من المقال أولًا.',
    );
    expect(screen.getByRole('button', { name: 'إضافة المعرض' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'limit.png' })).toBeDisabled();
    expect(expectedSlots).toBeLessThan(2);
  });
});
