// PROJECT.md §4: "결제 모듈은 정산 방식 교체가 가능하도록 인터페이스 분리" —
// 토스 지급대행 심사 결과나 정산 방식이 바뀌어도 이 인터페이스를 구현하는 파일만 바뀌면 되게 한다.
// 호출부(accept API 등)는 이 인터페이스만 알고, 어느 PG를 쓰는지는 모른다.

export interface BillingKeyResult {
  billingKey: string;
  /** 표시용 카드 정보 (settings/payment 카드 관리, 4단계) — 응답에 없으면 둘 다 null. */
  cardCompany: string | null;
  cardNumberMasked: string | null;
}

export interface ChargePaid {
  status: "paid";
  paymentKey: string;
}

/** PG가 명시적으로 거절했다 — 돈이 빠지지 않은 것이 확실하다. */
export interface ChargeDeclined {
  status: "declined";
  code: string;
  message: string;
}

/**
 * 결과를 모른다 — 네트워크 예외·타임아웃·해석 불가 응답. PG 쪽에서는 결제가 됐을 수도 있으므로
 * 호출부는 반드시 findPaymentByOrderId()로 대조한 뒤 처리해야 한다 (§4 P2).
 */
export interface ChargeUnknown {
  status: "unknown";
  message: string;
}

export type ChargeResult = ChargePaid | ChargeDeclined | ChargeUnknown;

export type PaymentLookup =
  | { found: true; paymentKey: string; status: string }
  | { found: false };

export type CancelResult = { ok: true } | { ok: false; code: string; message: string };

export interface PaymentGateway {
  /** 카드 등록(빌링 인증) 콜백에서 받은 authKey를 재사용 가능한 billingKey로 교환한다. */
  issueBillingKey(params: { authKey: string; customerKey: string }): Promise<BillingKeyResult>;

  /** 수락(낙찰) 순간 billingKey로 즉시 결제를 실행한다 (§3 [수락=낙찰] 2단계). 절대 throw하지 않는다. */
  chargeBilling(params: {
    billingKey: string;
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
  }): Promise<ChargeResult>;

  /** orderId로 결제를 조회한다. 조회 자체가 실패하면(네트워크 등) throw한다. */
  findPaymentByOrderId(orderId: string): Promise<PaymentLookup>;

  /** 결제 전액 취소 — 결제 후 낙찰 확정이 실패했을 때의 보상 처리 (§4 P1). 절대 throw하지 않는다. */
  cancelPayment(params: { paymentKey: string; reason: string }): Promise<CancelResult>;
}
