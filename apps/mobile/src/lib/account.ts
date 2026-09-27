import { supabase } from "./supabase";

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
}

// 3단계 A1 — apps/web/app/api/account/delete가 delete_own_account() RPC(익명화) +
// auth.users 소프트 삭제를 순서대로 실행한다 (service_role + admin API가 필요해 클라이언트에서
// 직접 할 수 없다 — apps/web/app/api/applications/[id]/accept/route.ts와 같은 구조).
export async function deleteAccount(accessToken: string): Promise<DeleteAccountResult> {
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error("EXPO_PUBLIC_WEB_ORIGIN is not set (.env, see .env.example)");
  }
  const res = await fetch(`${webOrigin}/api/account/delete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: json.error ?? "계정 삭제에 실패했어요" };
  }
  return { ok: true };
}

// 탈퇴가 성공하면 로컬 세션도 정리한다 — 서버 쪽 로그인 수단은 이미 무효화됐지만
// 기기에 남은 세션 토큰은 별도로 지워야 한다.
export async function signOutAfterDeletion(): Promise<void> {
  await supabase.auth.signOut();
}
