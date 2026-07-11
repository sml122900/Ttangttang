// PROJECT.md §4: "결제 모듈은 정산 방식 교체가 가능하도록 인터페이스 분리" —
// 토스 지급대행 심사 결과나 정산 방식이 바뀌어도 이 인터페이스를 구현하는 파일만 바뀌면 되게 한다.
// 호출부(accept API 등)는 이 인터페이스만 알고, 어느 PG를 쓰는지는 모른다.

export interface BillingKeyResult {
  billingKey: string;
}

export interface ChargeSuccess {
  ok: true;
  paymentKey: string;
}

export interface ChargeFailure {
  ok: false;
  code: string;
  message: string;
}

export type ChargeResult = ChargeSuccess | ChargeFailure;

export interface PaymentGateway {
  /** 카드 등록(빌링 인증) 콜백에서 받은 authKey를 재사용 가능한 billingKey로 교환한다. */
  issueBillingKey(params: { authKey: string; customerKey: string }): Promise<BillingKeyResult>;

  /** 수락(낙찰) 순간 billingKey로 즉시 결제를 실행한다 (§3 [수락=낙찰] 2단계). */
  chargeBilling(params: {
    billingKey: string;
    customerKey: string;
    amount: number;
    orderId: string;
    orderName: string;
  }): Promise<ChargeResult>;
}
