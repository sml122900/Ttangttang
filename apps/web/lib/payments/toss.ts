import type { BillingKeyResult, ChargeResult, PaymentGateway } from "./types";

const TOSS_API_BASE = "https://api.tosspayments.com/v1";

function authHeader(): string {
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) {
    throw new Error("TOSS_SECRET_KEY is not set (server-only env, see apps/web/.env.example)");
  }
  // 토스 API 인증: "{secretKey}:" 를 base64로 인코딩한 Basic 인증. 시크릿 키는 여기서만 쓰인다 —
  // 이 파일은 절대 클라이언트 번들에 포함되면 안 된다 ("use server" 경계인 route handler에서만 import).
  return `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
}

async function tossFetch(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${TOSS_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, json };
}

export const tossGateway: PaymentGateway = {
  async issueBillingKey({ authKey, customerKey }): Promise<BillingKeyResult> {
    const { ok, json } = await tossFetch("/billing/authorizations/issue", {
      authKey,
      customerKey,
    });
    if (!ok || typeof json.billingKey !== "string") {
      const message = typeof json.message === "string" ? json.message : "빌링키 발급에 실패했어요";
      throw new Error(message);
    }
    return { billingKey: json.billingKey };
  },

  async chargeBilling({ billingKey, customerKey, amount, orderId, orderName }): Promise<ChargeResult> {
    const { ok, json } = await tossFetch(`/billing/${encodeURIComponent(billingKey)}`, {
      customerKey,
      amount,
      orderId,
      orderName,
    });
    if (!ok) {
      const code = typeof json.code === "string" ? json.code : "UNKNOWN_ERROR";
      const message = typeof json.message === "string" ? json.message : "결제에 실패했어요";
      return { ok: false, code, message };
    }
    const paymentKey = json.paymentKey;
    if (typeof paymentKey !== "string") {
      return { ok: false, code: "MALFORMED_RESPONSE", message: "결제 응답에 paymentKey가 없어요" };
    }
    return { ok: true, paymentKey };
  },
};
