---
name: mukhtalif-article-writer
description: 'Prepare Arabic article drafts for Mukhtalif by gathering a focused brief through an interactive, one-question-at-a-time conversation, then producing a fact-conscious draft and an import-ready JSON payload. Use when a user wants to plan, write, or revise a Mukhtalif article; do not use for direct publishing or newsletter sending.'
---

# Mukhtalif Article Writer

Create a well-briefed Arabic article that the user can review and import into Mukhtalif Studio. This skill is a writing and preparation workflow only: it does not create a live record, publish an article, or send a newsletter.

## Start with an interactive brief

First determine what is already known and keep the evolving brief internally. Do not repeat details the user has supplied. If the brief is incomplete, the active model must conduct the intake directly in the chat:

- Ask exactly one direct question in Arabic per assistant turn, then stop and wait for the user's answer before asking anything else.
- Make each question atomic. Do not combine multiple missing fields into one compound question.
- Never present a numbered questionnaire, a batch of questions, a worksheet, or a fill-in template. Do not ask the user to copy questions, number answers, or reply in a special format. The user should answer naturally in the same ChatGPT, Claude, or other supported model conversation.
- After every answer, update the internal brief and choose the single highest-value missing question. Ask a short follow-up only when the previous answer is ambiguous or materially incomplete.
- Offer two or three short choices only when they make the current decision easier; still ask only one question and accept a natural-language answer.
- Stop the intake as soon as the brief is sufficient and proceed with the requested work. If the user already supplied a complete brief, do not ask another question.

### Use the host's native question control

- In Claude, use the native `AskUserQuestion` tool, shown as **Asking a question**, for every intake question whenever it is available. Do not replace it with a plain chat question while the native tool is usable.
- Put exactly one question in each `AskUserQuestion` call and set `multiSelect` to `false`. Never batch questions in one tool call, even if the host permits it.
- Write the question, short header, choices, and descriptions in Arabic. Give two to four concise, mutually exclusive choices when they help; the user must remain able to provide a natural custom answer through **Other**.
- Wait for the tool result before deciding whether another question is needed. Treat only the user's returned selection or custom response as their answer.
- If the native question tool is unavailable, fails to display, or returns no answer, ask the same single question once as plain Arabic text and wait. Never infer or invent an answer, and do not loop on failed tool calls.
- In ChatGPT or Codex, use an equivalent native question control when it is available and follow the same one-question rule; otherwise ask the question directly in chat.

Prioritize missing information roughly in this order, adapting to what the user has already said: the article's core idea or angle, intended reader, desired reader outcome, sources or notes, then optional constraints such as length, tone, and deadline. For factual or explanatory articles, confirm the angle, reader, desired outcome, and source status before drafting.

If sources are unavailable, ask one direct choice: whether the user wants a clearly framed opinion or practical framework, or prefers to wait for sources. Do not invent facts, quotes, statistics, sources, or links. If a source is absent, ask for it or mark the relevant claim for verification instead of presenting it as established fact.

Keep the intake conversational and short, and preserve the one-question-per-turn flow throughout. If the user asks what information will be needed, summarize only the remaining topic labels without turning them into a batch of questions, then ask the single current question. If they ask to start quickly, use clear modern Arabic and a reasonable article length, but still ask one source question before making factual claims.

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
