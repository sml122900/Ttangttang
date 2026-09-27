import { createServiceRoleClient } from "@/lib/supabase-admin";

// §4 P5 — 카드 등록 1회용 세션 (supabase/migrations/20260927000400_billing_auth_sessions.sql).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSessionId(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

export function appScheme(): string {
  return process.env.NEXT_PUBLIC_APP_SCHEME ?? "ttangttang";
}

// 카드 등록 후 돌아갈 곳은 우리 앱 딥링크뿐이다 (오픈 리다이렉트 차단).
// exp:// · exp+<scheme>:// 는 Expo Go / dev client가 Linking.createURL()로 만드는 형태.
export function isAllowedClientRedirect(value: string): boolean {
  if (value.length > 512) return false;
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(value)?.[1]?.toLowerCase();
  if (!scheme) return false;
  const app = appScheme().toLowerCase();
  return scheme === app || scheme === "exp" || scheme === `exp+${app}`;
}

export interface BillingSession {
  id: string;
  profile_id: string;
  client_redirect: string;
  expires_at: string;
  consumed_at: string | null;
}

export async function getBillingSession(id: string | null | undefined): Promise<BillingSession | null> {
  if (!isSessionId(id)) return null;
  const { data } = await createServiceRoleClient()
    .from("billing_auth_sessions")
    .select("id,profile_id,client_redirect,expires_at,consumed_at")
    .eq("id", id)
    .maybeSingle<BillingSession>();
  return data ?? null;
}

export function isUsable(session: BillingSession): boolean {
  return !session.consumed_at && new Date(session.expires_at).getTime() > Date.now();
}

// 조건부 UPDATE 한 문장으로 소비한다 — 같은 세션으로 두 번 콜백이 와도 한 번만 통과한다.
export async function consumeBillingSession(id: string): Promise<{ profileId: string } | null> {
  if (!isSessionId(id)) return null;
  const now = new Date().toISOString();
  const { data } = await createServiceRoleClient()
    .from("billing_auth_sessions")
    .update({ consumed_at: now })
    .eq("id", id)
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("profile_id")
    .maybeSingle<{ profile_id: string }>();
  return data ? { profileId: data.profile_id } : null;
}
