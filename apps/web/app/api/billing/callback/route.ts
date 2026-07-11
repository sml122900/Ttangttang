import { NextRequest, NextResponse } from "next/server";
import { paymentGateway } from "@/lib/payments";
import { createServiceRoleClient } from "@/lib/supabase-admin";

// 토스가 카드 등록 성공 후 브라우저를 이 URL로 리다이렉트한다 (top-level GET, query에 authKey/customerKey).
// customerKey는 billing-auth 페이지에서 넘긴 그대로 — 우리는 항상 profiles.id(auth.uid())를 넣으므로
// 여기서 곧바로 billing_keys.profile_id로 쓸 수 있다.
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const authKey = request.nextUrl.searchParams.get("authKey");
  const customerKey = request.nextUrl.searchParams.get("customerKey");
  const clientRedirectRaw = request.nextUrl.searchParams.get("clientRedirect");
  const clientRedirectQS = clientRedirectRaw
    ? `&clientRedirect=${encodeURIComponent(clientRedirectRaw)}`
    : "";

  if (!authKey || !customerKey) {
    return NextResponse.redirect(`${origin}/pay/billing-done?ok=0&reason=missing_params${clientRedirectQS}`);
  }

  try {
    const { billingKey } = await paymentGateway.issueBillingKey({ authKey, customerKey });

    const admin = createServiceRoleClient();
    const { error } = await admin
      .from("billing_keys")
      .upsert({ profile_id: customerKey, billing_key: billingKey, updated_at: new Date().toISOString() });
    if (error) throw error;

    return NextResponse.redirect(`${origin}/pay/billing-done?ok=1${clientRedirectQS}`);
  } catch (err) {
    const reason = encodeURIComponent(err instanceof Error ? err.message : String(err));
    return NextResponse.redirect(`${origin}/pay/billing-done?ok=0&reason=${reason}${clientRedirectQS}`);
  }
}
