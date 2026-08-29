import { describe, expect, it } from 'vitest';
import {
  AI_ARTICLE_SKILL_DOWNLOAD_URL,
  AI_ARTICLE_SKILL_FILENAME,
  AI_ARTICLE_SKILL_VERSION,
} from './article-ai-skill';

describe('article AI Skill download', () => {
  it('points to the versioned downloadable Skill package', () => {
    expect(AI_ARTICLE_SKILL_VERSION).toBe('1.0.0');
    expect(AI_ARTICLE_SKILL_FILENAME).toBe('mukhtalif-article-writer-1.0.0.zip');
    expect(AI_ARTICLE_SKILL_DOWNLOAD_URL).toBe(
      '/skills/mukhtalif-article-writer/1.0.0/mukhtalif-article-writer-1.0.0.zip',
    );
    expect(AI_ARTICLE_SKILL_DOWNLOAD_URL).not.toContain('.codex');
  });
});
