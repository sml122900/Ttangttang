import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { supabase } from "./supabase";

// Expo Go에서는 Linking.createURL이 세션마다 다른 exp://<LAN-IP>:<port>를 반환한다 —
// 이 값을 apps/web에 넘겨 카드등록 완료 후 정확히 이 앱으로 되돌아오게 한다.
const redirectTo = Linking.createURL("/");

export interface CardRegistrationResult {
  ok: boolean;
}

// 토스 카드등록창을 열고, apps/web(/pay/billing-auth → 토스 호스팅 화면 →
// /api/billing/callback → /pay/billing-done)을 거쳐 돌아올 때까지 기다린다.
// 먼저 access token으로 1회용 세션을 발급받는다 — 서버가 토큰 주인을 카드 등록 대상으로 고정하므로
// 다른 사람 명의로 카드를 등록할 수 없다 (§4 P5).
// 빌링키 원문은 절대 이 클라이언트에 오지 않는다 — 여기서는 성공/실패 여부만 안다
// (실제 등록 여부 확인은 has_billing_key() RPC로).
export async function openCardRegistration(accessToken: string): Promise<CardRegistrationResult> {
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error("EXPO_PUBLIC_WEB_ORIGIN is not set (.env, see .env.example)");
  }
  const res = await fetch(`${webOrigin}/api/billing/session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ clientRedirect: redirectTo }),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.error ?? "카드 등록을 시작하지 못했어요");
  }

  const result = await WebBrowser.openAuthSessionAsync(json.url, redirectTo);
  if (result.type !== "success") {
    return { ok: false };
  }
  const ok = new URL(result.url).searchParams.get("ok") === "1";
  return { ok };
}

export interface MyCardInfo {
  cardCompany: string | null;
  cardNumberMasked: string | null;
}

// 4단계 settings/payment 카드 관리 — get_my_card_info() RPC(SECURITY DEFINER)가 billing_key
// 원문 없이 표시용 정보만 돌려준다. 행이 없으면(카드 미등록) null.
export async function getMyCardInfo(): Promise<MyCardInfo | null> {
  const { data, error } = await supabase
    .rpc("get_my_card_info")
    .maybeSingle<{ card_company: string | null; card_number_masked: string | null }>();
  if (error) throw error;
  if (!data) return null;
  return { cardCompany: data.card_company, cardNumberMasked: data.card_number_masked };
}

export async function deleteBillingKey(): Promise<void> {
  const { error } = await supabase.rpc("delete_billing_key");
  if (error) throw error;
}
