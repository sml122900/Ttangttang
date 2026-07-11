import { createClient } from "@supabase/supabase-js";

// service_role — RLS를 우회한다. billing_keys 읽기/쓰기, finalize/revert 호출 등
// "클라이언트가 절대 직접 할 수 없어야 하는" 작업 전용. 이 파일은 서버 전용 코드에서만 import할 것
// (SUPABASE_SERVICE_ROLE_KEY는 NEXT_PUBLIC_ 접두사가 없어 클라이언트 번들에 포함되지 않는다).
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
