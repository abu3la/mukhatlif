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
