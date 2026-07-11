import { tossGateway } from "./toss";
import type { PaymentGateway } from "./types";

// 호출부는 이 export 하나만 참조한다. PG/정산 방식이 바뀌면 이 한 줄만 바꾸면 된다 (PROJECT.md §4).
export const paymentGateway: PaymentGateway = tossGateway;
export type { ChargeResult, BillingKeyResult, PaymentGateway } from "./types";
