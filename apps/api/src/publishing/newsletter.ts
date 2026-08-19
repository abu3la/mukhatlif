import type { Article, NewsletterPreview } from '@mukhtalif/types';
import { escapeHtml, renderRichText, richTextToEmailPlainText } from './rich-text';

function articleLink(article: Article, publicWebUrl: string | undefined): string | null {
  if (article.seo.canonicalUrl) return article.seo.canonicalUrl;
  if (!publicWebUrl) return null;
  return `${publicWebUrl.replace(/\/$/, '')}/articles/${encodeURIComponent(article.slug)}`;
}

/**
 * Produces conservative, table-based HTML with inline styles for Mailchimp.
 * Article content has already been rendered from an allowlisted JSON document.
 */
export function renderNewsletter(
  article: Article,
  publicWebUrl?: string,
  mediaPublicOrigin?: string,
): NewsletterPreview {
  const subject = article.newsletter.subject?.trim() || article.titleAr;
  const preheader = article.newsletter.preheader?.trim();
  const link = articleLink(article, publicWebUrl);
  const cover = article.coverUrl
    ? `<img src="${escapeHtml(article.coverUrl)}" alt="${escapeHtml(article.coverAlt ?? article.titleAr)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;margin:0 0 28px">`
    : '';
  const readOnline = link
    ? `<p style="margin:30px 0 0"><a href="${escapeHtml(link)}" style="color:#171A56;font-weight:700">اقرأ المقال على موقع مختلف</a></p>`
    : '';
  const hiddenPreheader = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all" aria-hidden="true">${escapeHtml(preheader)}</div>`
    : '';
  const emailContentHtml = renderRichText(article.content, {
    relativeLinkBaseUrl: publicWebUrl,
    mediaBaseUrl: mediaPublicOrigin,
    mode: 'email',
  });
  const emailContentText = publicWebUrl
    ? richTextToEmailPlainText(article.content, publicWebUrl)
    : article.bodyAr;
  const authorBylineText = `بقلم ${article.author.displayName}`;
  const authorBylineHtml = (margin: string) =>
    `<p style="margin:${margin};color:#4A4E7C;font-size:14px">بقلم <span dir="auto" style="unicode-bidi:isolate">${escapeHtml(article.author.displayName)}</span></p>`;
  const authorAfterTitle =
    article.authorPlacement === 'after_title' ? authorBylineHtml('0 0 18px') : '';
  const authorAtEnd = article.authorPlacement === 'end' ? authorBylineHtml('24px 0 0') : '';

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F9;color:#171A56;font-family:Arial,Tahoma,sans-serif">
${hiddenPreheader}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3F4F9"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF">
<tr><td style="padding:28px 34px 18px;text-align:right"><strong style="font-size:24px;letter-spacing:0">مختلف</strong><div style="margin-top:8px;color:#4A4E7C;font-size:14px">النشرة الأسبوعية</div></td></tr>
<tr><td style="padding:10px 34px 38px;text-align:right;line-height:1.8;font-size:17px">
${cover}<h1 style="margin:0 0 10px;font-size:32px;line-height:1.35;color:#171A56">${escapeHtml(article.titleAr)}</h1>
${authorAfterTitle}
${article.excerptAr ? `<p style="margin:0 0 24px;color:#4A4E7C;font-size:18px">${escapeHtml(article.excerptAr)}</p>` : ''}
<div style="color:#171A56">${emailContentHtml}</div>${authorAtEnd}${readOnline}
</td></tr>
<tr><td style="padding:24px 34px;background:#0D0F2E;color:#EAEBF6;text-align:right;font-size:12px;line-height:1.8">
<p style="margin:0 0 8px">تصل إليك هذه الرسالة لأنك مشترك في قائمة مختلف البريدية.</p>
<p style="margin:0">*|LIST:ADDRESSLINE|*</p>
<p style="margin:8px 0 0"><a href="*|UPDATE_PROFILE|*" style="color:#EAEBF6">تحديث التفضيلات</a> &nbsp; <a href="*|UNSUB|*" style="color:#EAEBF6">إلغاء الاشتراك</a></p>
</td></tr></table>
</td></tr></table>
</body></html>`;

  return {
    subject,
    preheader,
    html,
    text: [
      subject,
      preheader,
      article.titleAr,
      article.authorPlacement === 'after_title' ? authorBylineText : undefined,
      article.excerptAr,
      emailContentText,
      article.authorPlacement === 'end' ? authorBylineText : undefined,
      link,
      'تصل إليك هذه الرسالة لأنك مشترك في قائمة مختلف البريدية.',
      '*|LIST:ADDRESSLINE|*',
      'تحديث التفضيلات: *|UPDATE_PROFILE|*',
      'إلغاء الاشتراك: *|UNSUB|*',
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}
