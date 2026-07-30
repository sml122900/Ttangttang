// DB 타입 — supabase/migrations §2 스키마와 1:1로 대응한다.

export interface Profile {
  id: string;
  nickname: string;
  neighborhood: string;
  receiveRate: number;
  tradeCount: number;
  withdrawCount: number;
  createdAt: string;
}

// billing_keys 테이블은 클라이언트에 절대 노출하지 않는다 (service_role 전용).
// "카드가 등록돼 있는지"만 has_billing_key() RPC(boolean)로 확인한다.

export type ItemStatus = "live" | "awarded" | "completed" | "cancelled";

export interface Item {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  startPrice: number;
  photos: string[];
  neighborhood: string;
  status: ItemStatus;
  applyDeadline: string | null;
  pickupSlots: string[];   // 판매자가 등록 시점에 입력한 방문 가능 시간 (1~4개, 자유 텍스트)
  createdAt: string;
}

// 공개 뷰 — 지원자 신상 없이 지원자 수 · 최고 제시가만 노출 (supabase/migrations §2 참고)
export interface ItemPublicStats {
  itemId: string;
  applicantCount: number;
  topOfferPrice: number | null;
}

// public_profile_for_counterparty 뷰 — billing_key 등 민감정보는 절대 포함하지 않는다.
export interface PublicProfileForCounterparty {
  id: string;
  nickname: string;
  neighborhood: string;
  receiveRate: number;
  tradeCount: number;
}

export type AppStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "withdrawn"
  | "payment_failed";

export interface Application {
  id: string;
  itemId: string;
  applicantId: string;
  offerPrice: number;
  visitTime: string;
  message: string | null;
  status: AppStatus;
  createdAt: string;
}

export type TxStatus = "paid" | "completed" | "noshow_settled" | "refunded";

export interface Transaction {
  id: string;
  itemId: string;
  applicationId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  tossPaymentKey: string;
  status: TxStatus;
  pickupDeadline: string;
  completedAt: string | null;
  createdAt: string;
}

export interface Message {
  id: number;
  txId: string;
  senderId: string;
  body: string;
  createdAt: string;
}
