import { CLIENT_SURFACE_HEADER } from '@mukhtalif/types';

/** XHR exposes real upload progress, which fetch does not expose in browsers. */
export function uploadWithProgress(url: string, body: FormData, onProgress: (percent: number) => void): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('accept', 'application/json');
    xhr.setRequestHeader(CLIENT_SURFACE_HEADER, 'web');
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.min(100, Math.floor(event.loaded / event.total * 100)));
      }
    };
    xhr.onload = () => resolve(new Response(xhr.responseText, { status: xhr.status }));
    xhr.onerror = () => reject(new Error('Upload connection failed'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(body);
  });
}
