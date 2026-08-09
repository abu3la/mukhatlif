/** Arabic is the source language; English fields are optional translations. */
export interface Show {
  id: string;
  slug: string;
  titleAr: string;
  titleEn?: string;
  descriptionAr: string;
  descriptionEn?: string;
  hostName: string;
  artworkUrl?: string;
  category: string;
  /** Premium shows require an active subscription to stream. */
  premium: boolean;
  /** ISO timestamp */
  createdAt: string;
}
