import { supabase } from "./supabase";

// 3단계 — 신고·차단 (docs/decisions.md, supabase/migrations/20260928000200_reports_and_blocks.sql).

export type ReportTargetType = "item" | "application" | "message" | "user";

export interface SubmitReportParams {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  detail?: string;
}

// reports_insert_own RLS만 있고 select 정책은 없다 — .select() 없이 insert만 한다
// (읽어올 권한이 없어 .select()를 붙이면 빈 배열이 돌아온다).
export async function submitReport(params: SubmitReportParams): Promise<void> {
  const { error } = await supabase.from("reports").insert({
    target_type: params.targetType,
    target_id: params.targetId,
    reason: params.reason,
    detail: params.detail || null,
  });
  if (error) throw error;
}

// block_user()가 대상의 현재 닉네임을 서버에서 직접 조회해 blocks.blocked_nickname에 저장한다 —
// 클라이언트가 닉네임을 따로 넘길 필요가 없다.
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("block_user", { p_blocked_id: userId });
  if (error) throw error;
}

export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_user", { p_blocked_id: userId });
  if (error) throw error;
}

export interface BlockedUserRow {
  blockedId: string;
  nickname: string;
  createdAt: string;
}

export async function fetchMyBlocks(): Promise<BlockedUserRow[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id,blocked_nickname,created_at")
    .order("created_at", { ascending: false })
    .returns<{ blocked_id: string; blocked_nickname: string; created_at: string }[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    blockedId: row.blocked_id,
    nickname: row.blocked_nickname,
    createdAt: row.created_at,
  }));
}
