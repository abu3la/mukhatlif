import { z } from 'zod';
import { IMAGE_MEDIA_MIME_TYPES } from '@mukhtalif/types';

export const mediaAssetIdSchema = z
  .string()
  .regex(/^med-[0-9a-f]{32}$/, 'Invalid media asset identifier');

export const createMediaUploadSchema = z
  .object({
    fileName: z.string().trim().min(1).max(160),
    mimeType: z.enum(IMAGE_MEDIA_MIME_TYPES),
    byteSize: z.number().int().min(1).max(10 * 1024 * 1024),
    width: z.number().int().min(1).max(8_192),
    height: z.number().int().min(1).max(8_192),
    defaultAlt: z.string().trim().min(1).max(500),
    defaultCaption: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict()
  .refine((input) => input.width * input.height <= 24_000_000, {
    message: 'Image dimensions cannot exceed 24 megapixels',
    path: ['width'],
  });

export type CreateMediaUploadInput = z.infer<typeof createMediaUploadSchema>;
