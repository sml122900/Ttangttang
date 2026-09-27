import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";

// 3단계 A1 — 앱을 지웠거나 로그인할 수 없는 사용자를 위한 웹 삭제 요청 접수.
// 이 서비스는 카카오 로그인만 있고 별도 웹 로그인이 없어 즉시 자동 처리가 불가능하다 —
// 요청을 account_deletion_requests에 적재하고 운영자가 Supabase 대시보드에서 신원을 확인한
// 뒤 apps/web/app/api/account/delete와 같은 절차(delete_own_account + soft delete)를 수동으로
// 실행한다. 로그인이 필요 없는 공개 엔드포인트라 스팸 방지를 위해 아주 기본적인 형식만 검사한다.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { contact?: unknown; note?: unknown };
  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : null;

  if (!contact || contact.length > 200) {
    return NextResponse.json({ error: "가입 시 닉네임이나 연락처를 입력해주세요" }, { status: 400 });
  }

  const { error } = await createServiceRoleClient()
    .from("account_deletion_requests")
    .insert({ contact, note });
  if (error) {
    return NextResponse.json({ error: "요청 접수에 실패했어요. 잠시 후 다시 시도해주세요." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
