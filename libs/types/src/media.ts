export const MEDIA_ASSET_STATUSES = ['pending', 'ready'] as const;
export type MediaAssetStatus = (typeof MEDIA_ASSET_STATUSES)[number];

export const IMAGE_MEDIA_MIME_TYPES = ['image/jpeg', 'image/png'] as const;
export type ImageMediaMimeType = (typeof IMAGE_MEDIA_MIME_TYPES)[number];

/** Studio projection. The private R2 key and upload lease never cross the API boundary. */
export interface MediaAsset {
  id: string;
  kind: 'image';
  mimeType: ImageMediaMimeType;
  fileName: string;
  byteSize: number;
  width: number;
  height: number;
  defaultAlt: string;
  defaultCaption?: string;
  status: MediaAssetStatus;
  /** Present only for ready assets when a safe public origin is available. */
  publicUrl?: string;
  createdAt: string;
}

/** Public metadata projection. Original filenames and pending uploads remain private. */
export type PublicMediaAsset = Omit<MediaAsset, 'fileName' | 'status'> & {
  status: 'ready';
  publicUrl: string;
};

export interface MediaUploadReservation {
  asset: MediaAsset;
  uploadUrl: string;
}

/**
 * Episode audio upload contract, shared because the Studio must send a media
 * type the API will accept and the API must refuse anything else.
 *
 * Audio is not decoded or re-encoded: a Worker cannot cheaply inspect a media
 * container and an episode is far too large to buffer. Safety comes from
 * constraining what may be stored and how it is served, so an uploader cannot
 * park active content on the API origin and have it served back as a page.
 */
export const AUDIO_MEDIA_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/opus',
  'audio/wav',
  'audio/webm',
  'audio/flac',
] as const;

export type AudioMediaMimeType = (typeof AUDIO_MEDIA_MIME_TYPES)[number];

/** 512 MiB: above a long lossless episode, far below a runaway request body. */
export const MAX_AUDIO_UPLOAD_BYTES = 512 * 1024 * 1024;

const AUDIO_EXTENSIONS: Record<AudioMediaMimeType, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/wav': 'wav',
  'audio/webm': 'weba',
  'audio/flac': 'flac',
};

/** File extensions accepted for each audio media type, for client inference. */
const AUDIO_EXTENSION_ALIASES: Record<string, AudioMediaMimeType> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  m4b: 'audio/mp4',
  mp4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  wave: 'audio/wav',
  weba: 'audio/webm',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

/** Parses a Content-Type header, discarding parameters such as `codecs`. */
export function parseAudioMediaMimeType(header: string | undefined): AudioMediaMimeType | null {
  const base = header?.split(';')[0]?.trim().toLowerCase();
  return base && (AUDIO_MEDIA_MIME_TYPES as readonly string[]).includes(base)
    ? (base as AudioMediaMimeType)
    : null;
}

export function audioMediaExtension(mimeType: AudioMediaMimeType): string {
  return AUDIO_EXTENSIONS[mimeType];
}

/**
 * Best-effort media type for a chosen file. Browsers leave `File.type` empty
 * for some containers, so the extension is the documented fallback rather than
 * `application/octet-stream`, which the API refuses.
 */
export function resolveAudioMediaMimeType(
  declaredType: string | undefined,
  fileName: string | undefined,
): AudioMediaMimeType | null {
  const declared = parseAudioMediaMimeType(declaredType);
  if (declared) return declared;
  const extension = fileName?.split('.').pop()?.trim().toLowerCase();
  return extension ? (AUDIO_EXTENSION_ALIASES[extension] ?? null) : null;
}

/**
 * Media type used when serving. A stored value outside the allowlist is
 * downgraded rather than echoed back, so rows written before this contract
 * existed still cannot be re-interpreted by a browser.
 */
export function safeAudioMediaContentType(stored: string | undefined): AudioMediaMimeType {
  return parseAudioMediaMimeType(stored) ?? 'audio/mpeg';
}
