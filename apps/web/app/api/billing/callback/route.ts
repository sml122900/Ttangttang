import { NextRequest, NextResponse } from "next/server";
import { consumeBillingSession, isSessionId } from "@/lib/billing-session";
import { paymentGateway } from "@/lib/payments";
import { createServiceRoleClient } from "@/lib/supabase-admin";

// 토스가 카드 등록 성공 후 브라우저를 이 URL로 리다이렉트한다 (top-level GET, query에 authKey/customerKey).
// session은 우리가 successUrl에 실어 보낸 1회용 세션 id다 (§4 P5): 세션을 소비하면서 토스가 돌려준
// customerKey가 세션 주인(= access token으로 세션을 발급받은 사용자)과 같은지 확인한다.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  const authKey = params.get("authKey");
  const customerKey = params.get("customerKey");
  const session = params.get("session");
  const done = (qs: string) =>
    NextResponse.redirect(`${origin}/pay/billing-done?${qs}${isSessionId(session) ? `&session=${session}` : ""}`);

  if (!authKey || !customerKey || !isSessionId(session)) {
    return done("ok=0&reason=missing_params");
  }

  const consumed = await consumeBillingSession(session);
  if (!consumed) {
    return done("ok=0&reason=session_invalid");
  }
  if (consumed.profileId !== customerKey) {
    return done("ok=0&reason=customer_mismatch");
  }

  try {
    const { billingKey } = await paymentGateway.issueBillingKey({ authKey, customerKey });

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("billing_keys")
      .upsert({ profile_id: consumed.profileId, billing_key: billingKey, updated_at: new Date().toISOString() });
    if (error) throw error;

    return done("ok=1");
  } catch (err) {
    const reason = encodeURIComponent(err instanceof Error ? err.message : String(err));
    return done(`ok=0&reason=${reason}`);
  }
}
