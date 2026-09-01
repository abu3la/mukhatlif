import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_ARTICLE_SKILL_DOWNLOAD_URL,
  AI_ARTICLE_SKILL_FILENAME,
  AI_ARTICLE_SKILL_VERSION,
} from './article-ai-skill';

describe('article AI Skill download', () => {
  it('points to the versioned downloadable Skill package', () => {
    expect(AI_ARTICLE_SKILL_VERSION).toBe('1.0.2');
    expect(AI_ARTICLE_SKILL_FILENAME).toBe('mukhtalif-article-writer-1.0.2.zip');
    expect(AI_ARTICLE_SKILL_DOWNLOAD_URL).toBe(
      '/skills/mukhtalif-article-writer/1.0.2/mukhtalif-article-writer-1.0.2.zip',
    );
    expect(AI_ARTICLE_SKILL_DOWNLOAD_URL).not.toContain('.codex');

    const publicArchive = resolve(
      process.cwd(),
      'public',
      AI_ARTICLE_SKILL_DOWNLOAD_URL.slice(1),
    );
    expect(statSync(publicArchive).size).toBeGreaterThan(0);
  });
});
