// e2e 전용 모의 토스 API 서버. apps/web을 TOSS_API_BASE=http://127.0.0.1:<port>/v1 로 띄우면
// lib/payments/toss.ts의 실제 코드(타임아웃·멱등키·에러 해석)가 그대로 이 서버를 상대로 돈다.
//
// 결제 시나리오는 orderId(= application.id) 단위로 지정한다:
//   success              — 200 DONE
//   decline              — 400 REJECT_CARD_PAYMENT (돈 안 빠짐)
//   exception            — 토스는 결제를 처리했지만 응답 전에 연결이 끊김 → 조회하면 DONE
//   timeout              — 응답 없음, 결제도 안 됨 → 조회하면 404
//   timeout_lookup_fail  — 응답 없음 + 조회 API도 500(JSON 아님)
//   success_cancel_fail  — 결제 200 DONE, 취소 요청은 500
import http from "node:http";

export function startMockToss(port) {
  const state = {
    scenarios: new Map(), // orderId -> scenario
    payments: new Map(), // orderId -> { paymentKey, status }
    charges: [], // { orderId, amount, idempotencyKey }
    lookups: [], // orderId
    cancels: [], // { paymentKey, idempotencyKey, ok }
    issues: [], // { authKey, customerKey }
  };
  const hanging = new Set();

  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
    const url = new URL(req.url, "http://mock");
    const idempotencyKey = req.headers["idempotency-key"] ?? null;
    const send = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };

    if (!String(req.headers.authorization ?? "").startsWith("Basic ")) {
      return send(401, { code: "UNAUTHORIZED_KEY", message: "인증되지 않은 시크릿 키" });
    }

    let m;
    if (req.method === "POST" && url.pathname === "/v1/billing/authorizations/issue") {
      state.issues.push({ authKey: body.authKey, customerKey: body.customerKey });
      if (!String(body.authKey).startsWith("mock-auth-")) {
        return send(400, { code: "INVALID_AUTH_KEY", message: "잘못된 authKey" });
      }
      return send(200, { billingKey: `mock_bk_${body.customerKey}`, customerKey: body.customerKey });
    }

    if (req.method === "POST" && (m = url.pathname.match(/^\/v1\/billing\/([^/]+)$/))) {
      const { orderId, amount } = body;
      state.charges.push({ orderId, amount, idempotencyKey });
      const scenario = state.scenarios.get(orderId) ?? "success";
      const paymentKey = `mock_pk_${orderId}`;
      switch (scenario) {
        case "decline":
          return send(400, { code: "REJECT_CARD_PAYMENT", message: "한도초과 혹은 잔액부족으로 결제에 실패했어요" });
        case "exception":
          state.payments.set(orderId, { paymentKey, status: "DONE" });
          req.socket.destroy();
          return;
        case "timeout":
        case "timeout_lookup_fail":
          hanging.add(res);
          return;
        default:
          state.payments.set(orderId, { paymentKey, status: "DONE" });
          return send(200, { paymentKey, orderId, status: "DONE", totalAmount: amount });
      }
    }

    if (req.method === "GET" && (m = url.pathname.match(/^\/v1\/payments\/orders\/([^/]+)$/))) {
      const orderId = decodeURIComponent(m[1]);
      state.lookups.push(orderId);
      if (state.scenarios.get(orderId) === "timeout_lookup_fail") {
        res.writeHead(500, { "content-type": "text/html" });
        return res.end("<html>Internal Server Error</html>");
      }
      const p = state.payments.get(orderId);
      if (!p) return send(404, { code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제 정보" });
      return send(200, { paymentKey: p.paymentKey, orderId, status: p.status });
    }

    if (req.method === "POST" && (m = url.pathname.match(/^\/v1\/payments\/([^/]+)\/cancel$/))) {
      const paymentKey = decodeURIComponent(m[1]);
      const orderId = paymentKey.replace(/^mock_pk_/, "");
      const ok = state.scenarios.get(orderId) !== "success_cancel_fail";
      state.cancels.push({ paymentKey, idempotencyKey, ok });
      if (!ok) return send(500, { code: "FAILED_INTERNAL_SYSTEM_PROCESSING", message: "내부 시스템 처리 실패" });
      const p = state.payments.get(orderId);
      if (p) p.status = "CANCELED";
      return send(200, { paymentKey, status: "CANCELED" });
    }

    send(404, { code: "NOT_FOUND", message: `${req.method} ${url.pathname}` });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        state,
        base: `http://127.0.0.1:${port}/v1`,
        close: () =>
          new Promise((r) => {
            for (const res of hanging) res.socket?.destroy();
            server.closeAllConnections();
            server.close(() => r());
          }),
      });
    });
  });
}
