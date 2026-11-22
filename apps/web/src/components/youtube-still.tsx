'use client';

import { useEffect, useRef, useState } from 'react';
import { isYouTubeVideoId } from '@mukhtalif/types';

/**
 * A video's still at the size of a crossing picture (D-24). YouTube's large
 * still is there for almost every episode; where it is missing YouTube serves
 * a 120px placeholder, so the image falls back to the standard still. The
 * check also runs after hydration, for a still that loaded before it.
 */
export function YouTubeStill({
  videoId,
  className,
  priority = false,
}: {
  videoId: string | null | undefined;
  className?: string;
  priority?: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const image = ref.current;
    if (image?.complete && image.naturalWidth > 0 && image.naturalWidth < 400) setSmall(true);
  }, []);
  if (!isYouTubeVideoId(videoId)) return null;
  const src = `https://i.ytimg.com/vi/${videoId}/${small ? 'hqdefault' : 'maxresdefault'}.jpg`;
  return (
    <img
      ref={ref}
      className={className}
      src={src}
      alt=""
      width={1280}
      height={720}
      decoding="async"
      fetchPriority={priority ? 'high' : undefined}
      onLoad={(event) => {
        if (event.currentTarget.naturalWidth < 400) setSmall(true);
      }}
      onError={() => setSmall(true)}
    />
  );
}
