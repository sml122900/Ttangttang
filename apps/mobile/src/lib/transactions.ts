import { supabase } from "./supabase";

export interface MySaleTransaction {
  id: string;
  itemId: string;
  amount: number;
  buyerNickname: string;
}

interface RawTx {
  id: string;
  item_id: string;
  amount: number;
  buyer_id: string;
}

interface RawProfile {
  id: string;
  nickname: string;
}

// 판매자 입장에서 "낙찰 완료" 매물에 붙일 낙찰자 정보 — transactions_select_party RLS(§2)가
// 본인이 seller/buyer인 거래만 보이게 막는다. 닉네임은 public_profile_for_counterparty로 조회한다.
export async function fetchMySaleTransactions(sellerId: string): Promise<MySaleTransaction[]> {
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id,item_id,amount,buyer_id")
    .eq("seller_id", sellerId)
    .returns<RawTx[]>();
  if (error) throw error;
  if (!txs || txs.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("public_profile_for_counterparty")
    .select("id,nickname")
    .in(
      "id",
      txs.map((t) => t.buyer_id),
    )
    .returns<RawProfile[]>();
  if (profilesError) throw profilesError;

  const nicknameById = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));
  return txs.map((t) => ({
    id: t.id,
    itemId: t.item_id,
    amount: t.amount,
    buyerNickname: nicknameById.get(t.buyer_id) ?? "이웃",
  }));
}

// 구매자 입장에서 "내 지원" 목록의 낙찰(accepted) 건에 채팅방 id를 붙이기 위한 조회.
// application_id로 매핑해두면 trades.tsx가 applications 행과 그대로 조인해 쓸 수 있다.
export async function fetchMyPurchaseTransactionsByApplicationId(
  buyerId: string,
): Promise<Map<string, string>> {
  const { data: txs, error } = await supabase
    .from("transactions")
    .select("id,application_id")
    .eq("buyer_id", buyerId)
    .returns<{ id: string; application_id: string }[]>();
  if (error) throw error;
  return new Map((txs ?? []).map((t) => [t.application_id, t.id]));
}
