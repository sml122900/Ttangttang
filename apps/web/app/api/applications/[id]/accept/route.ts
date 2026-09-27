import { NextRequest, NextResponse } from "next/server";
import { paymentGateway } from "@/lib/payments";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { bearerTokenFrom, createUserScopedClient } from "@/lib/supabase-user";

// 토스 호출(최대 TOSS_TIMEOUT_MS) + 조회 + 취소가 한 요청에 들어갈 수 있다 (§4 P10).
export const maxDuration = 60;

interface ApplicationRow {
  id: string;
  item_id: string;
  applicant_id: string;
  offer_price: number;
}

interface ItemRow {
  id: string;
  title: string;
  pickup_deadline_hours: number;
}

type RouteParams = { params: Promise<{ id: string }> };
type Admin = ReturnType<typeof createServiceRoleClient>;

const ACCEPT_ERRORS: Record<string, { status: number; error: string }> = {
  TT409: { status: 409, error: "이 지원서는 방금 철회됐어요" },
  TT410: { status: 409, error: "이미 낙찰됐거나 마감된 매물이에요" },
  TT411: { status: 409, error: "이미 처리된 지원서예요" },
  "42501": { status: 403, error: "이 매물의 판매자만 수락할 수 있어요" },
};

async function recordIncident(
  admin: Admin,
  applicationId: string,
  kind: string,
  detail: string,
  paymentKey?: string,
) {
  const { error } = await admin
    .from("payment_incidents")
    .insert({ application_id: applicationId, kind, detail, payment_key: paymentKey ?? null });
  // 기록마저 실패하면 서버 로그가 마지막 단서다.
  if (error) console.error("[accept] payment_incidents insert failed", { applicationId, kind, detail, error });
}

// revert 실패를 삼키지 않는다 (§4 P3) — 매물이 awarded에 묶인 채 남기 때문.
async function revert(admin: Admin, applicationId: string) {
  const { error } = await admin.rpc("revert_failed_acceptance", { p_application_id: applicationId });
  if (error) await recordIncident(admin, applicationId, "revert_failed", error.message);
}

function paymentFailed(reason: string, status = 402) {
  return NextResponse.json({ error: "결제 실패 — 다른 지원서를 선택해주세요", reason }, { status });
}

// §3 [수락=낙찰] — 판매자의 "수락하기" 버튼 하나가 이 API 하나를 부른다.
// 1) accept_application(): 판매자 본인 확인 + 철회/중복수락 레이스를 DB 트랜잭션으로 원자 차단
//    (사용자 스코프 클라이언트로 호출 — auth.uid()가 이 요청을 보낸 판매자로 해석되게 함).
// 2) 토스 빌링 결제 실행. 결과를 모르면(예외·타임아웃) orderId로 조회해 대조한다 (§4 P2).
// 3) 성공 → finalize_accepted_application() / 실패 → revert_failed_acceptance()
//    finalize가 실패하면 결제를 취소하는 보상 처리 후 되돌린다 (§4 P1).
//    (finalize/revert는 service_role 전용 함수라 서비스 롤 클라이언트로만 호출 가능하다.)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: applicationId } = await params;

  const accessToken = bearerTokenFrom(request);
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const userClient = createUserScopedClient(accessToken);
  const admin = createServiceRoleClient();

  // ---------- 1) 조건부 이중 UPDATE ----------
  const { data: acceptedApp, error: acceptError } = await userClient
    .rpc("accept_application", { p_application_id: applicationId })
    .single<ApplicationRow>();

  if (acceptError) {
    const mapped = ACCEPT_ERRORS[acceptError.code];
    if (mapped) return NextResponse.json({ error: mapped.error, code: acceptError.code }, { status: mapped.status });
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
    await revert(admin, applicationId);
    return paymentFailed("빌링키를 찾을 수 없어요");
  }

  const { data: item } = await admin
    .from("items")
    .select("id,title,pickup_deadline_hours")
    .eq("id", acceptedApp.item_id)
    .maybeSingle<ItemRow>();

  // orderId = application.id: 지원서당 결제는 한 번뿐이라(payment_failed는 재수락 불가) 고유하다.
  const orderId = acceptedApp.id;
  const charge = await paymentGateway.chargeBilling({
    billingKey: billingRow.billing_key,
    customerKey: acceptedApp.applicant_id,
    amount: acceptedApp.offer_price,
    orderId,
    orderName: item?.title ?? "땅땅 나눔 거래",
  });

  let paymentKey: string;
  if (charge.status === "paid") {
    paymentKey = charge.paymentKey;
  } else if (charge.status === "declined") {
    await revert(admin, applicationId);
    return paymentFailed(charge.message);
  } else {
    // 결과 모름 → 토스에 실제로 결제가 됐는지 orderId로 대조한다.
    let lookup;
    try {
      lookup = await paymentGateway.findPaymentByOrderId(orderId);
    } catch (err) {
      await revert(admin, applicationId);
      await recordIncident(
        admin,
        applicationId,
        "charge_unknown_unresolved",
        `charge: ${charge.message} / lookup: ${err instanceof Error ? err.message : String(err)}`,
      );
      return paymentFailed("결제 결과를 확인하지 못했어요. 잠시 후 다시 시도해주세요.", 502);
    }
    if (lookup.found && lookup.status === "DONE") {
      paymentKey = lookup.paymentKey;
    } else {
      await revert(admin, applicationId);
      // 조회 시점엔 없었어도 토스가 늦게 승인할 수 있다 — 대조용으로 남긴다.
      await recordIncident(
        admin,
        applicationId,
        "charge_unknown_not_found",
        `charge: ${charge.message} / lookup: ${lookup.found ? lookup.status : "NOT_FOUND"}`,
      );
      return paymentFailed(charge.message);
    }
  }

  // ---------- 3) 결제 성공 → 낙찰 확정 ----------
  // pickup_deadline: 판매자가 등록 화면에서 고른 수령시한(items.pickup_deadline_hours, 4단계).
  // item 조회가 어떤 이유로든 비면(이론상 거의 없음) 24시간으로 안전하게 폴백한다.
  const pickupHours = item?.pickup_deadline_hours ?? 24;
  const pickupDeadline = new Date(Date.now() + pickupHours * 60 * 60 * 1000).toISOString();

  const { data: tx, error: finalizeError } = await admin
    .rpc("finalize_accepted_application", {
      p_application_id: applicationId,
      p_toss_payment_key: paymentKey,
      p_pickup_deadline: pickupDeadline,
    })
    .single();

  if (finalizeError) {
    // 보상 처리: 돈은 빠졌는데 낙찰이 확정되지 않았다 → 결제를 취소한다.
    const cancel = await paymentGateway.cancelPayment({
      paymentKey,
      reason: "낙찰 확정 처리 실패로 인한 자동 취소",
    });
    if (cancel.ok) {
      await revert(admin, applicationId);
      await recordIncident(admin, applicationId, "finalize_failed_canceled", finalizeError.message, paymentKey);
      return NextResponse.json(
        { error: "낙찰 처리 중 오류가 나서 결제를 취소했어요. 다시 시도해주세요.", reason: finalizeError.message },
        { status: 500 },
      );
    }
    // 취소도 실패: 되돌리면 매물이 다시 live가 되어 다른 지원자에게 이중 결제될 수 있으므로
    // accepted/awarded 상태를 유지한 채 운영자 수동 처리로 넘긴다.
    await recordIncident(
      admin,
      applicationId,
      "finalize_failed_cancel_failed",
      `finalize: ${finalizeError.message} / cancel: ${cancel.code} ${cancel.message}`,
      paymentKey,
    );
    return NextResponse.json(
      { error: "결제는 됐지만 낙찰 처리에 실패했어요. 고객센터에서 확인 후 처리해드릴게요.", code: "NEEDS_REVIEW" },
      { status: 500 },
    );
  }

  return NextResponse.json({ transaction: tx });
}
