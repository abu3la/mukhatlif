// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { uploadWithProgress } from './upload-with-progress';

let xhr: FakeXHR;
class FakeXHR {
  upload = { onprogress: null as null | ((event: ProgressEvent) => void) };
  status = 200;
  responseText = '{"token":"uploaded"}';
  timeout = 0;
  onload = () => {};
  onerror = () => {};
  ontimeout = () => {};
  onabort = () => {};
  open = vi.fn();
  setRequestHeader = vi.fn();
  send = vi.fn();
}
afterEach(() => vi.unstubAllGlobals());
it('reports measured transfer progress and returns the server response', async () => {
  xhr = new FakeXHR();
  vi.stubGlobal('XMLHttpRequest', class { constructor() { return xhr; } });
  const progress = vi.fn();
  const pending = uploadWithProgress('/attachments', new FormData(), progress);
  xhr.upload.onprogress!(new ProgressEvent('progress', { lengthComputable: true, loaded: 42, total: 100 }));
  expect(progress).toHaveBeenLastCalledWith(42);
  xhr.upload.onprogress!(new ProgressEvent('progress', { lengthComputable: false, loaded: 50 }));
  expect(progress).toHaveBeenCalledTimes(1);
  xhr.upload.onprogress!(new ProgressEvent('progress', { lengthComputable: true, loaded: 100, total: 100 }));
  expect(progress).toHaveBeenLastCalledWith(100);
  xhr.onload();
  expect(await (await pending).json()).toEqual({ token: 'uploaded' });
});
it('rejects connection failures so the form can leave its busy state', async () => {
  xhr = new FakeXHR();
  vi.stubGlobal('XMLHttpRequest', class { constructor() { return xhr; } });
  const pending = uploadWithProgress('/attachments', new FormData(), vi.fn());
  const rejected = expect(pending).rejects.toThrow('Upload connection failed');
  xhr.onerror();
  await rejected;
});
