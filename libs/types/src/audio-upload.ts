/** Browser upload state contains no storage keys or provider credentials. */
export interface EpisodeAudioUploadSession {
  id: string;
  size: number;
  partSize: number;
  partCount: number;
  fileName: string;
  status: 'active' | 'finalizing' | 'completed' | 'cancelled';
  expiresAt: number;
  uploadedParts: number[];
}
