import { createClient } from "@supabase/supabase-js";

// 공개 페이지(랜딩/공유랜딩) 전용 — publishable key + RLS 공개 정책(items, item_public_stats)만으로
// 충분하다. 인증이 필요한 화면은 웹에 없다 (§1: 웹은 거래 기능 없음).
export function createPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  }
  return createClient(url, publishableKey, { auth: { persistSession: false } });
}
