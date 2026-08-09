export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** R2 bucket for episode audio; optional until provisioned. */
  AUDIO?: R2Bucket;
}
