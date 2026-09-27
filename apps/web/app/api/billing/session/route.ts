import { NextRequest, NextResponse } from "next/server";
import { isAllowedClientRedirect } from "@/lib/billing-session";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { bearerTokenFrom } from "@/lib/supabase-user";

// §4 P5 — 앱이 카드 등록 웹뷰를 열기 전에 호출한다. access token의 주인에게만 세션을 발급하므로
// 카드 등록 대상(customerKey)을 요청자가 임의로 고를 수 없다.
export async function POST(request: NextRequest) {
  const accessToken = bearerTokenFrom(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { clientRedirect?: unknown };
  const clientRedirect = typeof body.clientRedirect === "string" ? body.clientRedirect : "";
  if (!isAllowedClientRedirect(clientRedirect)) {
    return NextResponse.json({ error: "허용되지 않은 clientRedirect예요" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("billing_auth_sessions")
    .insert({ profile_id: userData.user.id, client_redirect: clientRedirect })
    .select("id")
    .single<{ id: string }>();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const origin = request.nextUrl.origin;
  return NextResponse.json({ url: `${origin}/pay/billing-auth?session=${data.id}` });
}
