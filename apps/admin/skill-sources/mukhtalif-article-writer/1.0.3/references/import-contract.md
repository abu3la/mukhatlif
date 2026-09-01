# Mukhtalif article import contract

Use this contract only when returning content that the user will paste into **مقال بمساعدة AI** in Mukhtalif Studio.

```json
{
  "schema": "mukhtalif.article-ai/v1",
  "title": "عنوان عربي واضح",
  "slug": "english-url-slug",
  "excerpt": "ملخص قصير للمقال",
  "seo": {
    "title": "عنوان بحث مختصر",
    "description": "وصف بحث مختصر"
  },
  "blocks": [
    { "type": "paragraph", "text": "افتتاحية المقال." },
    { "type": "heading", "level": 2, "text": "عنوان فرعي" },
    { "type": "paragraph", "text": "فقرة تشرح الفكرة." },
    { "type": "bullets", "items": ["نقطة أولى", "نقطة ثانية"] },
    { "type": "ordered_list", "items": ["خطوة أولى", "خطوة ثانية"] }
  ]
}
```

Rules:

- `schema` must be exactly `mukhtalif.article-ai/v1`.
- `title` is required and at most 180 characters.
- `slug` is required: lowercase English letters, numbers, and hyphens only.
- `excerpt` is optional and at most 500 characters.
- `seo.title` is optional and at most 70 characters; `seo.description` is optional and at most 170 characters.
- The payload may contain at most 400 blocks; each list may contain at most 100 items.
- Allowed block types are only `paragraph`, `heading`, `bullets`, `ordered_list`, and `quote`.
- A heading level must be `2` or `3`.
- Use a `quote` only when the user supplied the exact wording and its source.
- Do not include HTML, Markdown syntax, links, images, media IDs, newsletter commands, or publish/send instructions in the payload.
