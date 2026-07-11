import { supabase } from "./supabase";

export interface MySaleTransaction {
  itemId: string;
  amount: number;
  buyerNickname: string;
}

interface RawTx {
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
    .select("item_id,amount,buyer_id")
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
    itemId: t.item_id,
    amount: t.amount,
    buyerNickname: nicknameById.get(t.buyer_id) ?? "이웃",
  }));
}
