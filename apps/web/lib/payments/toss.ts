import type {
  BillingKeyResult,
  CancelResult,
  ChargeResult,
  PaymentGateway,
  PaymentLookup,
} from "./types";

// TOSS_API_BASE는 e2e에서 모의 토스 서버를 가리키게 할 때만 바꾼다 (scripts/e2e-flow.mjs).
function apiBase(): string {
  return process.env.TOSS_API_BASE ?? "https://api.tosspayments.com/v1";
}

// 토스 응답이 늦으면 서버리스 함수 전체가 묶인다 — 결과를 모르는 상태(unknown)로 끊고
// orderId 조회로 대조하는 편이 낫다 (§4 P2, P10).
function timeoutMs(): number {
  const n = Number(process.env.TOSS_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 10_000;
}

function authHeader(): string {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    throw new Error("TOSS_SECRET_KEY is not set (server-only env, see apps/web/.env.example)");
  }
  // 토스 API 인증: "{secretKey}:" 를 base64로 인코딩한 Basic 인증. 시크릿 키는 여기서만 쓰인다 —
  // 이 파일은 절대 클라이언트 번들에 포함되면 안 된다 ("use server" 경계인 route handler에서만 import).
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

// 네트워크 예외·타임아웃·JSON이 아닌 응답은 전부 throw한다 — 호출부가 "결과 모름"으로 분류한다.
async function tossFetch(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown>; idempotencyKey?: string },
) {
  const headers: Record<string, string> = { Authorization: authHeader() };
  if (init.body) headers["Content-Type"] = "application/json";
  // 같은 키로 재요청하면 토스가 첫 응답을 그대로 돌려준다 — 이중 결제·이중 취소 방지 (§4 P4).
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const res = await fetch(`${apiBase()}${path}`, {
    method: init.method,
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs()),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

function str(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// 4단계 settings/payment 카드 관리용 — 토스 응답이 카드 정보를 최상위(cardCompany/cardNumber)에
// 두는지 card 객체 안에 두는지 이 세션에서 실제 응답으로 검증하지 못했다(테스트 키로는 카드
// 발급 자체가 막힘, docs/troubleshooting/toss-billing-no-dedicated-test-card.md). 두 형태를 다
// 시도하고 없으면 null로 둔다 — 둘 다 nullable 컬럼이라 실패해도 카드 등록 자체는 안 깨진다.
// 실카드로 인앱 확인할 때(docs/phone-check.md) 실제 필드명을 확인해 좁혀야 한다.
function extractCardInfo(json: Record<string, unknown>): { company: string | null; masked: string | null } {
  const card = (json.card as Record<string, unknown> | undefined) ?? {};
  const company = strOrNull(json.cardCompany) ?? strOrNull(card.company) ?? strOrNull(card.issuerCode);
  const masked = strOrNull(json.cardNumber) ?? strOrNull(card.number);
  return { company, masked };
}

export const tossGateway: PaymentGateway = {
  async issueBillingKey({ authKey, customerKey }): Promise<BillingKeyResult> {
    const { ok, json } = await tossFetch("/billing/authorizations/issue", {
      method: "POST",
      body: { authKey, customerKey },
    });
    if (!ok || typeof json.billingKey !== "string") {
      throw new Error(str(json.message, "빌링키 발급에 실패했어요"));
    }
    const { company, masked } = extractCardInfo(json);
    return { billingKey: json.billingKey, cardCompany: company, cardNumberMasked: masked };
  },

  async chargeBilling({ billingKey, customerKey, amount, orderId, orderName }): Promise<ChargeResult> {
    let res;
    try {
      res = await tossFetch(`/billing/${encodeURIComponent(billingKey)}`, {
        method: "POST",
        body: { customerKey, amount, orderId, orderName },
        idempotencyKey: `charge-${orderId}`,
      });
    } catch (err) {
      return { status: "unknown", message: err instanceof Error ? err.message : String(err) };
    }
    // 5xx는 토스 내부 처리 도중 실패일 수 있어 "거절"로 단정하지 않는다.
    if (res.status >= 500) {
      return { status: "unknown", message: str(res.json.message, `HTTP ${res.status}`) };
    }
    if (!res.ok) {
      return {
        status: "declined",
        code: str(res.json.code, "UNKNOWN_ERROR"),
        message: str(res.json.message, "결제에 실패했어요"),
      };
    }
    if (typeof res.json.paymentKey !== "string") {
      return { status: "unknown", message: "결제 응답에 paymentKey가 없어요" };
    }
    return { status: "paid", paymentKey: res.json.paymentKey };
  },

  async findPaymentByOrderId(orderId): Promise<PaymentLookup> {
    const { ok, status, json } = await tossFetch(`/payments/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
    });
    if (status === 404) return { found: false };
    if (!ok || typeof json.paymentKey !== "string") {
      throw new Error(`결제 조회 실패: ${str(json.message, `HTTP ${status}`)}`);
    }
    return { found: true, paymentKey: json.paymentKey, status: str(json.status, "UNKNOWN") };
  },

  async cancelPayment({ paymentKey, reason }): Promise<CancelResult> {
    try {
      const { ok, json } = await tossFetch(`/payments/${encodeURIComponent(paymentKey)}/cancel`, {
        method: "POST",
        body: { cancelReason: reason },
        idempotencyKey: `cancel-${paymentKey}`,
      });
      if (!ok) {
        return { ok: false, code: str(json.code, "UNKNOWN_ERROR"), message: str(json.message, "결제 취소 실패") };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, code: "NETWORK_ERROR", message: err instanceof Error ? err.message : String(err) };
    }
  },
};
