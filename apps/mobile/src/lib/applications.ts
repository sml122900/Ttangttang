import { supabase } from "./supabase";
import type { AppStatus } from "@ttangttang/shared";

export async function hasBillingKey(): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_billing_key");
  if (error) throw error;
  return Boolean(data);
}

export interface SubmitApplicationParams {
  itemId: string;
  applicantId: string;
  offerPrice: number;
  visitTime: string;
  message: string;
}

// upsert — 재지원(같은 매물에 다시 지원)은 applications 유니크 제약(item_id, applicant_id) 덕에
// 자동으로 "금액/시간 수정"이 된다 (§3 [지원]).
export async function submitApplication(params: SubmitApplicationParams): Promise<void> {
  const { error } = await supabase.from("applications").upsert(
    {
      item_id: params.itemId,
      applicant_id: params.applicantId,
      offer_price: params.offerPrice,
      visit_time: params.visitTime,
      message: params.message || null,
      status: "pending",
    },
    { onConflict: "item_id,applicant_id" },
  );
  if (error) throw error;
}

export async function withdrawApplication(applicationId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_application", { p_application_id: applicationId });
  if (error) throw error;
}

export interface MyApplicationRow {
  id: string;
  itemId: string;
  itemTitle: string;
  offerPrice: number;
  visitTime: string;
  status: AppStatus;
  createdAt: string;
}

interface RawMyApplication {
  id: string;
  item_id: string;
  offer_price: number;
  visit_time: string;
  status: AppStatus;
  created_at: string;
  items: { title: string } | null;
}

export async function fetchMyApplications(applicantId: string): Promise<MyApplicationRow[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("id,item_id,offer_price,visit_time,status,created_at,items(title)")
    .eq("applicant_id", applicantId)
    .order("created_at", { ascending: false })
    .returns<RawMyApplication[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    itemTitle: row.items?.title ?? "알 수 없는 매물",
    offerPrice: row.offer_price,
    visitTime: row.visit_time,
    status: row.status,
    createdAt: row.created_at,
  }));
}

export interface ApplicantRow {
  applicationId: string;
  offerPrice: number;
  visitTime: string;
  message: string | null;
  status: AppStatus;
  createdAt: string;
  applicant: {
    id: string;
    nickname: string;
    receiveRate: number;
    tradeCount: number;
  };
}

interface RawApplicant {
  id: string;
  offer_price: number;
  visit_time: string;
  message: string | null;
  status: AppStatus;
  created_at: string;
  applicant_id: string;
}

interface RawProfile {
  id: string;
  nickname: string;
  receive_rate: number;
  trade_count: number;
}

// 판매자 전용 — applications_select_own_or_seller RLS가 "자기 매물의 지원서"만 보이게 막는다.
// 지원자 신상은 public_profile_for_counterparty 뷰(닉네임/수령률/거래횟수만)로 따로 조회한다.
export async function fetchApplicants(itemId: string): Promise<ApplicantRow[]> {
  const { data: apps, error } = await supabase
    .from("applications")
    .select("id,offer_price,visit_time,message,status,created_at,applicant_id")
    .eq("item_id", itemId)
    .neq("status", "withdrawn")
    .order("offer_price", { ascending: false })
    .returns<RawApplicant[]>();
  if (error) throw error;
  if (!apps || apps.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("public_profile_for_counterparty")
    .select("id,nickname,receive_rate,trade_count")
    .in(
      "id",
      apps.map((a) => a.applicant_id),
    )
    .returns<RawProfile[]>();
  if (profilesError) throw profilesError;

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  return apps.map((a) => {
    const profile = profileById.get(a.applicant_id);
    return {
      applicationId: a.id,
      offerPrice: a.offer_price,
      visitTime: a.visit_time,
      message: a.message,
      status: a.status,
      createdAt: a.created_at,
      applicant: {
        id: a.applicant_id,
        nickname: profile?.nickname ?? "이웃",
        receiveRate: profile?.receive_rate ?? 100,
        tradeCount: profile?.trade_count ?? 0,
      },
    };
  });
}

export interface AcceptApplicationResult {
  ok: boolean;
  error?: string;
}

// §3 [수락=낙찰] — apps/web 서버 전용 API가 accept_application → 토스 결제 → finalize/revert
// 체인을 실행한다 (billing_key/토스 시크릿키가 필요해 클라이언트에서 직접 할 수 없다).
export async function acceptApplication(
  applicationId: string,
  accessToken: string,
): Promise<AcceptApplicationResult> {
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error("EXPO_PUBLIC_WEB_ORIGIN is not set (.env, see .env.example)");
  }
  const res = await fetch(`${webOrigin}/api/applications/${applicationId}/accept`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    return { ok: false, error: json.error ?? "수락에 실패했어요" };
  }
  return { ok: true };
}
