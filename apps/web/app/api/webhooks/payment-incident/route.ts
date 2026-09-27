import { NextRequest, NextResponse } from "next/server";

// §4 P1/P2 사후 대조용 payment_incidents(공식 migrations/20260927000300)에 행이 생기면 즉시
// 알림을 받기 위한 릴레이. Supabase Database Webhook(대시보드에서 설정 — docs/decisions/
// environment-separation.md 참고)이 INSERT 시 이 엔드포인트를 호출하고, 여기서 Discord가
// 이해하는 형식으로 바꿔 DISCORD_WEBHOOK_URL로 다시 보낸다.
//
// Discord 웹훅 URL을 Supabase 웹훅 설정에 직접 넣지 않는 이유: Supabase의 기본 페이로드
// ({type, table, record, ...})에는 Discord가 요구하는 "content"/"embeds" 필드가 없어서 그대로
// 보내면 400이 난다. 이 릴레이가 형식을 변환하고, Discord URL 자체도 여기(서버 env)에만 있게
// 되어 Supabase 프로젝트 설정 화면에 평문으로 노출되지 않는다.
//
// 인증: Supabase Database Webhook의 "HTTP Headers"에 x-webhook-secret을 설정해 요청자를
// 검증한다 (SUPABASE_WEBHOOK_SECRET, apps/web/.env.example 참고).

interface PaymentIncidentRecord {
  id: number;
  application_id: string;
  kind: string;
  payment_key: string | null;
  detail: string | null;
  created_at: string;
}

interface SupabaseWebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: PaymentIncidentRecord | null;
}

const KIND_LABEL: Record<string, string> = {
  charge_unknown_not_found: "결제 결과 불명 → 미발견(되돌림)",
  charge_unknown_unresolved: "결제 결과 불명 → 조회도 실패(되돌림, 수동 대조 필요)",
  finalize_failed_canceled: "결제 성공, 확정 실패 → 결제 취소함(되돌림)",
  finalize_failed_cancel_failed: "결제 성공, 확정 실패, 취소도 실패 → 상태 유지(수동 처리 필요)",
  revert_failed: "되돌리기 자체가 실패함(수동 처리 필요)",
};

// finalize_failed_cancel_failed / revert_failed는 돈과 DB 상태가 어긋난 채로 남아있다는 뜻이라
// 사람이 반드시 봐야 한다. 나머지는 시스템이 스스로 되돌린 것이라 기록용에 가깝다.
const URGENT_KINDS = new Set(["finalize_failed_cancel_failed", "revert_failed"]);

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!expectedSecret) {
    // 시크릿이 설정 안 된 초기 상태에서는 조용히 200을 준다 — Supabase 쪽 재시도 폭주를 막기 위함.
    console.warn("[payment-incident webhook] SUPABASE_WEBHOOK_SECRET not set — skipping");
    return NextResponse.json({ skipped: true });
  }
  if (request.headers.get("x-webhook-secret") !== expectedSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as SupabaseWebhookPayload | null;
  const record = payload?.record;
  if (!record) {
    return NextResponse.json({ error: "no record in payload" }, { status: 400 });
  }

  const discordUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!discordUrl) {
    console.warn("[payment-incident webhook] DISCORD_WEBHOOK_URL not set — logging only", record);
    return NextResponse.json({ skipped: true, reason: "DISCORD_WEBHOOK_URL not set" });
  }

  const urgent = URGENT_KINDS.has(record.kind);
  const res = await fetch(discordUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: urgent ? "🚨 **수동 처리 필요** — 결제와 DB 상태가 어긋났어요" : undefined,
      embeds: [
        {
          title: KIND_LABEL[record.kind] ?? record.kind,
          color: urgent ? 0xe5503c : 0xf5a623,
          fields: [
            { name: "application_id", value: record.application_id, inline: false },
            { name: "payment_key", value: record.payment_key ?? "(없음)", inline: false },
            { name: "detail", value: (record.detail ?? "").slice(0, 1000) || "(없음)", inline: false },
          ],
          timestamp: record.created_at,
        },
      ],
    }),
  });

  if (!res.ok) {
    console.error("[payment-incident webhook] Discord relay failed", res.status, await res.text().catch(() => ""));
    return NextResponse.json({ error: "discord relay failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
