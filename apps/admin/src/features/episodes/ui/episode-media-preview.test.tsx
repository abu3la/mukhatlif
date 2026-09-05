import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpisodeMediaPreview } from './episode-media-preview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('episode media preview', () => {
  it('loads nothing until opened and switches players without simultaneous playback', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EpisodeMediaPreview
        title="حلقة حقيقية"
        youtubeUrl="https://youtu.be/Ioch353mcfc"
        savedAudioUrl="https://api.mukhtalif.net/episodes/real/audio"
      />,
    );
    expect(container.querySelector('audio, iframe')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'معاينة الحلقة' }));
    expect(container.querySelector('audio')).toHaveAttribute('preload', 'none');
    expect(screen.getByRole('img', { name: 'صورة بطاقة الحلقة' })).toHaveAttribute(
      'src',
      'https://i.ytimg.com/vi/Ioch353mcfc/hqdefault.jpg',
    );
    await user.click(screen.getByRole('button', { name: 'مشاهدة الحلقة' }));
    expect(container.querySelector('audio')).toBeNull();
    expect(container.querySelector('iframe')).toHaveAttribute(
      'src',
      'https://www.youtube-nocookie.com/embed/Ioch353mcfc?playsinline=1&rel=0',
    );
    await user.click(screen.getByRole('button', { name: 'الصوت المحفوظ' }));
    expect(container.querySelector('iframe')).toBeNull();
    fireEvent.error(container.querySelector('audio')!);
    expect(screen.getByRole('alert')).toHaveTextContent('تعذّر تشغيل الصوت');
    await user.click(screen.getByRole('button', { name: 'إغلاق المعاينة' }));
    expect(container.querySelector('audio, iframe')).toBeNull();
  });

  it('previews an unuploaded local file and releases its object URL on close', async () => {
    const revoke = vi.fn();
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:preview-local');
        static revokeObjectURL = revoke;
      },
    );
    const user = userEvent.setup();
    const file = new File(['test'], 'review.mp3', { type: 'audio/mpeg' });
    const { container } = render(<EpisodeMediaPreview title="مسودة" youtubeUrl="" file={file} />);
    await user.click(screen.getByRole('button', { name: 'معاينة الحلقة' }));
    await user.click(screen.getByRole('button', { name: 'الملف المختار' }));
    expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:preview-local');
    expect(screen.getByText(/لم يُرفع بعد/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'إغلاق المعاينة' }));
    expect(revoke).toHaveBeenCalledWith('blob:preview-local');
  });

  it('does not embed arbitrary URLs and links to the saved public page separately', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <EpisodeMediaPreview
        title="حلقة"
        youtubeUrl="https://evil.example/embed/test"
        publishedUrl="https://staging.mukhtalif.net/episodes/real"
      />,
    );
    await user.click(screen.getByRole('button', { name: 'معاينة الحلقة' }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button', { name: 'مشاهدة الحلقة' })).toBeNull();
    expect(screen.getByRole('link', { name: 'فتح الحلقة على الموقع' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });
});
