import { NextRequest, NextResponse } from "next/server";
import { paymentGateway } from "@/lib/payments";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { bearerTokenFrom, createUserScopedClient } from "@/lib/supabase-user";

interface ApplicationRow {
  id: string;
  item_id: string;
  applicant_id: string;
  offer_price: number;
}

interface ItemRow {
  id: string;
  title: string;
}

type RouteParams = { params: Promise<{ id: string }> };

// §3 [수락=낙찰] — 판매자의 "수락하기" 버튼 하나가 이 API 하나를 부른다.
// 1) accept_application(): 판매자 본인 확인 + 철회/중복수락 레이스를 DB 트랜잭션으로 원자 차단
//    (사용자 스코프 클라이언트로 호출 — auth.uid()가 이 요청을 보낸 판매자로 해석되게 함).
// 2) 토스 빌링 결제 실행.
// 3) 성공 → finalize_accepted_application() / 실패 → revert_failed_acceptance()
//    (둘 다 service_role 전용 함수라 서비스 롤 클라이언트로만 호출 가능하다).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: applicationId } = await params;

  const accessToken = bearerTokenFrom(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const userClient = createUserScopedClient(accessToken);
  const admin = createServiceRoleClient();

  // ---------- 1) 조건부 이중 UPDATE (accept_application 내부에서 IS DISTINCT FROM으로 판매자 본인 확인) ----------
  const { data: acceptedApp, error: acceptError } = await userClient
    .rpc("accept_application", { p_application_id: applicationId })
    .single<ApplicationRow>();

  if (acceptError) {
    if (acceptError.code === "TT409") {
      return NextResponse.json({ error: "이 지원서는 방금 철회됐어요" }, { status: 409 });
    }
    if (acceptError.code === "42501") {
      return NextResponse.json({ error: "이 매물의 판매자만 수락할 수 있어요" }, { status: 403 });
    }
    return NextResponse.json({ error: acceptError.message }, { status: 500 });
  }
  if (!acceptedApp) {
    return NextResponse.json({ error: "지원서를 찾을 수 없어요" }, { status: 404 });
  }

  // ---------- 2) 토스 빌링 결제 ----------
  // billing_key 원문은 service_role만 읽을 수 있다 (billing_keys에는 클라이언트 정책이 없다).
  const { data: billingRow, error: billingError } = await admin
    .from("billing_keys")
    .select("billing_key")
    .eq("profile_id", acceptedApp.applicant_id)
    .maybeSingle<{ billing_key: string }>();

  if (billingError || !billingRow) {
    await admin.rpc("revert_failed_acceptance", { p_application_id: applicationId });
    return NextResponse.json(
      { error: "결제 실패 — 다른 지원서를 선택해주세요", reason: "빌링키를 찾을 수 없어요" },
      { status: 402 },
    );
  }

  const { data: item } = await admin
    .from("items")
    .select("id,title")
    .eq("id", acceptedApp.item_id)
    .maybeSingle<ItemRow>();

  const charge = await paymentGateway.chargeBilling({
    billingKey: billingRow.billing_key,
    customerKey: acceptedApp.applicant_id,
    amount: acceptedApp.offer_price,
    orderId: acceptedApp.id,
    orderName: item?.title ?? "땅땅 나눔 거래",
  });

  if (!charge.ok) {
    await admin.rpc("revert_failed_acceptance", { p_application_id: applicationId });
    return NextResponse.json(
      { error: "결제 실패 — 다른 지원서를 선택해주세요", reason: charge.message },
      { status: 402 },
    );
  }

  // ---------- 3) 결제 성공 → 낙찰 확정 ----------
  // pickup_deadline: 등록 화면에 아직 "수령시한" 입력이 없어(§6 백로그) 24시간 고정값을 쓴다.
  // 실제 수령시한 UI가 생기면 accept_application/finalize 시그니처에 값을 실어 보내도록 바꿀 것.
  const pickupDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: tx, error: finalizeError } = await admin
    .rpc("finalize_accepted_application", {
      p_application_id: applicationId,
      p_toss_payment_key: charge.paymentKey,
      p_pickup_deadline: pickupDeadline,
    })
    .single();

  if (finalizeError) {
    return NextResponse.json({ error: finalizeError.message }, { status: 500 });
  }

  return NextResponse.json({ transaction: tx });
}
