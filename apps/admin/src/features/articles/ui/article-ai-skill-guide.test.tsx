import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  AI_ARTICLE_SKILL_CHATGPT_GUIDE_URL,
  AI_ARTICLE_SKILL_CLAUDE_GUIDE_URL,
  AI_ARTICLE_SKILL_DOWNLOAD_URL,
  AI_ARTICLE_SKILL_FILENAME,
} from './article-ai-skill';
import { ArticleAiSkillGuide } from './article-ai-skill-guide';

describe('ArticleAiSkillGuide', () => {
  it('explains installation for ChatGPT Desktop and Claude', async () => {
    const user = userEvent.setup();
    render(<ArticleAiSkillGuide />);

    const guide = screen.getByRole('region', { name: 'سكيل المقالات في محادثتك' });
    expect(guide).toHaveTextContent('ChatGPT Desktop');
    expect(guide).toHaveTextContent('Claude');
    expect(guide).toHaveTextContent('سؤالًا واحدًا في كل مرة');
    expect(guide).toHaveTextContent('لا ترفق ملف ZIP في رسالة عادية');

    const download = within(guide).getByRole('link', { name: 'تنزيل سكيل المقالات' });
    expect(download).toHaveAttribute('href', AI_ARTICLE_SKILL_DOWNLOAD_URL);
    expect(download).toHaveAttribute('download', AI_ARTICLE_SKILL_FILENAME);
    expect(download).toHaveAttribute('type', 'application/zip');

    const disclosure = guide.querySelector('details');
    const summary = guide.querySelector('summary');
    expect(summary).toHaveTextContent(/طريقة التثبيت على ChatGPT Desktop\s+و\s+Claude/);
    expect(disclosure).not.toHaveAttribute('open');

    await user.tab();
    expect(download).toHaveFocus();
    await user.tab();
    expect(summary).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(disclosure).toHaveAttribute('open');

    await user.click(summary!);
    expect(disclosure).not.toHaveAttribute('open');
    await user.click(summary!);
    expect(disclosure).toHaveAttribute('open');

    const chatGptInstructions = within(guide).getByRole('region', {
      name: 'ChatGPT Desktop',
    });
    expect(chatGptInstructions).toHaveTextContent('$HOME/.agents/skills/mukhtalif-article-writer');
    expect(chatGptInstructions).toHaveTextContent('محرر مختلف');
    expect(
      within(chatGptInstructions).getByRole('link', {
        name: 'دليل OpenAI، يفتح في تبويب جديد',
      }),
    ).toHaveAttribute('href', AI_ARTICLE_SKILL_CHATGPT_GUIDE_URL);

    const claudeInstructions = within(guide).getByRole('region', { name: 'Claude' });
    expect(claudeInstructions).toHaveTextContent('Code execution and file creation');
    expect(claudeInstructions).toHaveTextContent('Upload a skill');
    expect(claudeInstructions).toHaveTextContent('Asking a question');
    expect(
      within(claudeInstructions).getByRole('link', {
        name: 'دليل Claude، يفتح في تبويب جديد',
      }),
    ).toHaveAttribute('href', AI_ARTICLE_SKILL_CLAUDE_GUIDE_URL);
  });
});
