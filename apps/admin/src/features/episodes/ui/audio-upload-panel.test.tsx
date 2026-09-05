import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AudioUploadPanel } from './audio-upload-panel';
import { EpisodeAudioTransfer, type AudioTransferSnapshot } from '@/data/episode-audio-transfer';
afterEach(cleanup);
const props = () => ({
  file: new File(['123456'], 'حلقة طويلة.wav', { type: 'audio/wav' }),
  fileName: 'حلقة طويلة.wav',
  disabled: true,
  invalid: false,
  transfer: new EpisodeAudioTransfer(6, () => undefined),
  onSelect: vi.fn(),
  onClear: vi.fn(),
  onUpload: vi.fn(),
});
const state = (phase: AudioTransferSnapshot['phase']): AudioTransferSnapshot => ({
  phase,
  total: 6,
  loaded: 3,
  confirmed: 3,
});

describe('audio upload controls', () => {
  it('shows measurable progress and wires actual pause and cancel controls', async () => {
    const p = props();
    const pause = vi.spyOn(p.transfer, 'pause');
    const cancel = vi.spyOn(p.transfer, 'cancel');
    render(
      <MemoryRouter>
        <AudioUploadPanel {...p} state={state('uploading')} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar', { name: 'تقدم رفع الصوت' })).toHaveAttribute(
      'value',
      '50',
    );
    await userEvent.click(screen.getByRole('button', { name: 'إيقاف مؤقت' }));
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء الرفع' }));
    expect(pause).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'اختيار ملف آخر' })).not.toBeInTheDocument();
  });
  it('keeps progress and offers a working resume action while paused', async () => {
    const p = props();
    const resume = vi.spyOn(p.transfer, 'resume');
    render(
      <MemoryRouter>
        <AudioUploadPanel {...p} state={state('paused')} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('الرفع متوقف مؤقتًا');
    await userEvent.click(screen.getByRole('button', { name: 'استئناف الرفع' }));
    expect(resume).toHaveBeenCalledOnce();
  });
  it('distinguishes 100% transmission from confirmed completion and prevents late cancellation', () => {
    const p = props();
    const { rerender } = render(
      <MemoryRouter>
        <AudioUploadPanel {...p} state={{ ...state('finalizing'), loaded: 6 }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '100');
    expect(screen.getByRole('status')).toHaveTextContent('جارٍ التحقق من الملف');
    expect(screen.queryByRole('button', { name: 'إلغاء الرفع' })).not.toBeInTheDocument();
    expect(screen.queryByText('اكتمل رفع الصوت')).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <AudioUploadPanel {...p} disabled={false} state={{ ...state('completed'), loaded: 6 }} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('اكتمل رفع الصوت');
  });
  it('accepts a selected file and drag/drop only when editable', async () => {
    const p = props();
    const { rerender } = render(
      <MemoryRouter>
        <AudioUploadPanel {...p} disabled={false} />
      </MemoryRouter>,
    );
    await userEvent.upload(screen.getByLabelText('اختيار ملف الصوت'), p.file);
    expect(p.onSelect).toHaveBeenCalledWith(p.file);
    expect(p.onUpload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'رفع الملف' }));
    expect(p.onUpload).toHaveBeenCalledOnce();
    fireEvent.drop(document.querySelector('.audio-upload')!, { dataTransfer: { files: [p.file] } });
    expect(p.onSelect).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'إلغاء الاختيار' }));
    expect(p.onClear).toHaveBeenCalledOnce();
    rerender(
      <MemoryRouter>
        <AudioUploadPanel {...p} />
      </MemoryRouter>,
    );
    fireEvent.drop(document.querySelector('.audio-upload')!, { dataTransfer: { files: [p.file] } });
    expect(p.onSelect).toHaveBeenCalledTimes(2);
  });
  it('warns before page close while the upload is active', () => {
    const p = props();
    render(
      <MemoryRouter>
        <AudioUploadPanel {...p} state={state('paused')} />
      </MemoryRouter>,
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
