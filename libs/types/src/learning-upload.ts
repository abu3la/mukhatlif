/** Shared per-file limits for native course uploads; multipart chunks remain 5 MiB. */
export const COURSE_UPLOAD_LIMITS = {
  pdf: { bytes: 100 * 1024 ** 2, label: '100 ميجابايت' },
  mp3: { bytes: 1024 ** 3, label: '1 جيجابايت' },
  mp4: { bytes: 5 * 1024 ** 3, label: '5 جيجابايت' },
  webm: { bytes: 5 * 1024 ** 3, label: '5 جيجابايت' },
} as const;
export const MAX_COURSE_UPLOAD_BYTES = COURSE_UPLOAD_LIMITS.mp4.bytes;
export function courseUploadLimit(filename: string) {
  const extension = filename.split('.').pop()?.toLowerCase();
  return extension && Object.hasOwn(COURSE_UPLOAD_LIMITS, extension)
    ? COURSE_UPLOAD_LIMITS[extension as keyof typeof COURSE_UPLOAD_LIMITS]
    : undefined;
}
