import { supabase } from "./supabase";

export interface ChatMessage {
  id: number;
  txId: string;
  senderId: string;
  body: string;
  createdAt: string;
}

interface RawMessage {
  id: number;
  tx_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

function mapMessage(row: RawMessage): ChatMessage {
  return { id: row.id, txId: row.tx_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at };
}

// messages_select_party RLS(§2)가 해당 거래의 buyer_id/seller_id 당사자만 읽을 수 있게 막는다.
export async function fetchMessages(txId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id,tx_id,sender_id,body,created_at")
    .eq("tx_id", txId)
    .order("created_at", { ascending: true })
    .returns<RawMessage[]>();
  if (error) throw error;
  return (data ?? []).map(mapMessage);
}

export async function sendMessage(txId: string, senderId: string, body: string): Promise<void> {
  const { error } = await supabase.from("messages").insert({
    tx_id: txId,
    sender_id: senderId,
    body,
  });
  if (error) throw error;
}

// Realtime(postgres_changes)도 messages_select_party RLS를 그대로 적용받으므로,
// 당사자가 아닌 채널 구독자에게는 애초에 INSERT 이벤트 자체가 전달되지 않는다.
export function subscribeToMessages(txId: string, onInsert: (message: ChatMessage) => void): () => void {
  const channel = supabase
    .channel(`messages:${txId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `tx_id=eq.${txId}` },
      (payload) => onInsert(mapMessage(payload.new as RawMessage)),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

export interface ChatTransaction {
  id: string;
  itemId: string;
  itemTitle: string;
  buyerId: string;
  sellerId: string;
  status: string;
  pickupDeadline: string;
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  counterparty: { id: string; nickname: string };
}

interface RawTransaction {
  id: string;
  item_id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  pickup_deadline: string;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  items: { title: string } | null;
}

// transactions_select_party RLS가 본인이 buyer/seller인 거래만 보이게 막아, selfId가 당사자가
// 아니면 tx 자체가 null로 돌아온다 (채팅방 접근 자체가 막히는 셈).
export async function fetchChatTransaction(txId: string, selfId: string): Promise<ChatTransaction | null> {
  const { data: tx, error } = await supabase
    .from("transactions")
    .select("id,item_id,buyer_id,seller_id,status,pickup_deadline,buyer_confirmed_at,seller_confirmed_at,items(title)")
    .eq("id", txId)
    .maybeSingle<RawTransaction>();
  if (error) throw error;
  if (!tx) return null;

  const counterpartyId = tx.buyer_id === selfId ? tx.seller_id : tx.buyer_id;
  const { data: profile, error: profileError } = await supabase
    .from("public_profile_for_counterparty")
    .select("id,nickname")
    .eq("id", counterpartyId)
    .maybeSingle<{ id: string; nickname: string }>();
  if (profileError) throw profileError;

  return {
    id: tx.id,
    itemId: tx.item_id,
    itemTitle: tx.items?.title ?? "거래",
    buyerId: tx.buyer_id,
    sellerId: tx.seller_id,
    status: tx.status,
    pickupDeadline: tx.pickup_deadline,
    buyerConfirmedAt: tx.buyer_confirmed_at,
    sellerConfirmedAt: tx.seller_confirmed_at,
    counterparty: { id: counterpartyId, nickname: profile?.nickname ?? "이웃" },
  };
}

export async function confirmPickup(txId: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc("confirm_pickup", { p_transaction_id: txId }).single<{ status: string }>();
  if (error) throw error;
  return { status: data.status };
}
