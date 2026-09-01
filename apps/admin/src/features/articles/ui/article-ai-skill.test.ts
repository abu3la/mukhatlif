import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AI_ARTICLE_SKILL_DOWNLOAD_URL,
  AI_ARTICLE_SKILL_FILENAME,
  AI_ARTICLE_SKILL_VERSION,
} from './article-ai-skill';

describe('article AI Skill download', () => {
  it('points to the versioned downloadable Skill package', () => {
    expect(AI_ARTICLE_SKILL_VERSION).toBe('1.0.3');
    expect(AI_ARTICLE_SKILL_FILENAME).toBe('mukhtalif-article-writer-1.0.3.zip');
    expect(AI_ARTICLE_SKILL_DOWNLOAD_URL).toBe(
      '/skills/mukhtalif-article-writer/1.0.3/mukhtalif-article-writer-1.0.3.zip',
    );
    expect(AI_ARTICLE_SKILL_DOWNLOAD_URL).not.toContain('.codex');

    const publicArchive = resolve(
      process.cwd(),
      'public',
      AI_ARTICLE_SKILL_DOWNLOAD_URL.slice(1),
    );
    expect(statSync(publicArchive).size).toBeGreaterThan(0);
  });

  it('uses Claude native questions one at a time with a safe fallback', () => {
    const skillSource = resolve(
      process.cwd(),
      'skill-sources',
      'mukhtalif-article-writer',
      AI_ARTICLE_SKILL_VERSION,
      'SKILL.md',
    );
    const instructions = readFileSync(skillSource, 'utf8');

    expect(instructions).toContain('`AskUserQuestion`');
    expect(instructions).toContain('**Asking a question**');
    expect(instructions).toContain('Put exactly one question in each `AskUserQuestion` call');
    expect(instructions).toContain('If the native question tool is unavailable');
    expect(instructions).toContain('Never infer or invent an answer');
  });
});
