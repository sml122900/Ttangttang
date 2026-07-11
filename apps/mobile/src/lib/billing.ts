import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";

// Expo Go에서는 Linking.createURL이 세션마다 다른 exp://<LAN-IP>:<port>를 반환한다 —
// 이 값을 apps/web에 넘겨 카드등록 완료 후 정확히 이 앱으로 되돌아오게 한다.
const redirectTo = Linking.createURL("/");

export interface CardRegistrationResult {
  ok: boolean;
}

// 토스 카드등록창을 열고, apps/web(/pay/billing-auth → 토스 호스팅 화면 →
// /api/billing/callback → /pay/billing-done)을 거쳐 돌아올 때까지 기다린다.
// 빌링키 원문은 절대 이 클라이언트에 오지 않는다 — apps/web이 service role로 billing_keys에
// 저장할 뿐이고, 여기서는 성공/실패 여부만 안다 (실제 등록 여부 확인은 has_billing_key() RPC로).
export async function openCardRegistration(customerKey: string): Promise<CardRegistrationResult> {
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error("EXPO_PUBLIC_WEB_ORIGIN is not set (.env, see .env.example)");
  }
  const url = `${webOrigin}/pay/billing-auth?customerKey=${encodeURIComponent(
    customerKey,
  )}&clientRedirect=${encodeURIComponent(redirectTo)}`;

  const result = await WebBrowser.openAuthSessionAsync(url, redirectTo);
  if (result.type !== "success") {
    return { ok: false };
  }
  const ok = new URL(result.url).searchParams.get("ok") === "1";
  return { ok };
}
