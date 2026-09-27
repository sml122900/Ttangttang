import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase-admin";
import { bearerTokenFrom, createUserScopedClient } from "@/lib/supabase-user";

// 3단계 A1 — 인앱 계정 삭제(익명화 소프트 삭제, docs/decisions.md 2026-09-27 사용자 결정 +
// supabase/migrations/20260928000100_account_deletion.sql의 주석 참고).
//
// 1) delete_own_account() — 사용자 스코프 RPC. 진행 중 거래가 있으면 여기서 막힌다(TT420).
//    성공하면 profiles 익명화 + billing_keys 삭제 + 내 live 매물 취소까지 끝난 상태.
// 2) admin.auth.admin.deleteUser(id, true) — **소프트 삭제**. auth.users를 물리적으로 지우면
//    profiles가 on delete cascade로 함께 삭제되는데, 거래 이력이 있으면 그게 다시
//    items/applications/transactions/messages의 FK(RESTRICT)에 막혀 실패한다. 소프트 삭제는
//    로그인 수단만 무효화하고 행은 남겨 이 문제를 피한다 — "거래·메시지는 보존" 결정과
//    호환되는 유일한 방법이라 이렇게 구현했다.
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
  const userId = userData.user.id;

  const userClient = createUserScopedClient(accessToken);
  const { error: rpcError } = await userClient.rpc("delete_own_account");
  if (rpcError) {
    if (rpcError.code === "TT420") {
      return NextResponse.json({ error: "진행 중인 거래가 있어 탈퇴할 수 없어요" }, { status: 409 });
    }
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  // shouldSoftDelete=true — 물리적 DELETE가 아니라 deleted_at 마킹 + 로그인 수단 무효화.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, true);
  if (deleteError) {
    // profiles는 이미 익명화됐는데 로그인 수단만 남은 어긋난 상태 — 재시도해도 안전하다
    // (delete_own_account는 멱등: 이미 익명화된 프로필을 다시 익명화할 뿐이고, 진행 중 거래도
    // 이미 없다는 게 1)에서 확인됐다). 여기서 실패하면 사용자에게 다시 시도를 안내한다.
    console.error("[account delete] auth soft-delete failed after anonymization", userId, deleteError);
    return NextResponse.json(
      { error: "계정 삭제가 일부만 처리됐어요. 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
