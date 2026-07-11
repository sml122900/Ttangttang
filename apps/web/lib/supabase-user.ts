import { createClient } from "@supabase/supabase-js";

// 모바일이 보낸 Authorization: Bearer <access_token>을 그대로 PostgREST에 전달해
// auth.uid()가 "그 요청을 보낸 사용자"로 해석되게 한다 — anon/authenticated 권한과
// RLS(예: accept_application의 판매자 본인 확인)가 API 레이어를 거쳐도 그대로 강제된다.
// service_role로 우회하지 않는 것이 핵심: 이 클라이언트로는 다른 사람 행세를 할 수 없다.
export function createUserScopedClient(accessToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set");
  }
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function bearerTokenFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}
