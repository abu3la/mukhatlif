'use client';

import { useState } from 'react';
import { youtubeThumbnailUrl } from '@mukhtalif/types';

export function EpisodeThumbnail({
  videoId,
  className,
}: {
  videoId?: string | null;
  className?: string;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const src = youtubeThumbnailUrl(videoId);
  if (!src || failedSource === src) return null;
  return (
    <img
      src={src}
      alt=""
      width={480}
      height={360}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSource(src)}
    />
  );
}
