---
name: mukhtalif-article-writer
description: "Prepare Arabic article drafts for Mukhtalif by gathering a focused brief first, then producing a fact-conscious draft and an import-ready JSON payload. Use when a user wants to plan, write, or revise a Mukhtalif article; do not use for direct publishing or newsletter sending."
---

# Mukhtalif Article Writer

Create a well-briefed Arabic article that the user can review and import into Mukhtalif Studio. This skill is a writing and preparation workflow only: it does not create a live record, publish an article, or send a newsletter.

## Start with the brief

First determine what is already known. Do not repeat details the user has supplied. If the brief is incomplete, ask the missing questions together in Arabic, using a compact prompt such as:

1. ما الفكرة أو الزاوية التي تريد أن يخرج بها المقال؟
2. من القارئ المقصود، وما الذي تريد أن يفهمه أو يفعله بعد القراءة؟
3. ما المصادر أو الملاحظات التي يجب الاعتماد عليها؟
4. هل لديك طول أو نبرة أو موعد محدد؟

Treat the first three as essential for factual or explanatory articles. If sources are unavailable, explicitly ask whether the user wants a clearly framed opinion/practical framework or prefers to wait for sources. Do not invent facts, quotes, statistics, sources, or links. If a source is absent, ask for it or mark the relevant claim for verification instead of presenting it as established fact.

Keep the intake conversational and short. If the user provides a complete brief, proceed without another question. If they ask to start quickly, use clear modern Arabic and a reasonable article length, but still ask for sources before making factual claims.

## Prepare the draft

Once the brief is sufficient:

- Write for the stated reader and purpose, with a clear opening, useful subheadings, and a concrete ending.
- Prefer precise Arabic and short, readable paragraphs. Explain terms on first use when needed.
- Propose a specific Arabic title, an English URL slug, a concise excerpt, and SEO title and description.
- Keep the source list outside the import payload so the user can verify it. Do not put unverified citations in the article.
- Ask for confirmation before changing the article's intended angle, target reader, or factual basis.

## Import-ready output

When the user wants a draft ready for Studio, read [the import contract](references/import-contract.md). Produce the exact `mukhtalif.article-ai/v1` JSON payload in a fenced `json` block. The Studio importer accepts fenced JSON.

Before the payload, give only a short review note: title, intended reader, and any claims or sources that still need checking. If the user asks for “JSON فقط” or “جاهز للاستيراد”, return the JSON block alone.

Tell the user how to import it: **مقال جديد → مقال بمساعدة AI → الصق ناتج AI بصيغة JSON → استيراد إلى المسودة → راجع → حفظ المسودة**.

## Boundaries

- Do not use or request API keys, passwords, or private credentials.
- Do not claim that a draft was created in Mukhtalif. This skill prepares the content for the existing importer.
- Do not publish an article, change a live article, create a Mailchimp campaign, or send email.
- Keep cover image, author, newsletter settings, and final editorial approval with the user in Studio.
