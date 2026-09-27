#!/usr/bin/env node
// 땅땅 핵심 플로우(§3 PROJECT.md)와 결제 체인 실패 경로를 폰 없이 검증하는 E2E 스크립트.
//
// 실행: pnpm e2e   (= node --env-file=scripts/.env scripts/e2e-flow.mjs)
//
// 이 스크립트가 직접 띄우는 것:
//   - 모의 토스 서버 (scripts/lib/mock-toss.mjs, 기본 127.0.0.1:4545)
//   - apps/web 개발 서버 (next dev, 기본 포트 3100) — TOSS_API_BASE를 모의 서버로,
//     TOSS_TIMEOUT_MS를 짧게, TOSS_SECRET_KEY를 가짜 값으로 덮어써서 띄운다.
//     진짜 토스로는 요청이 한 건도 나가지 않는다 (실카드 불필요 — docs/decisions.md 참고).
// Supabase는 클라우드 dev 프로젝트를 그대로 쓴다. 실행 중 만든 매물·지원서·거래·메시지·
// payment_incidents는 끝날 때 service role로 지운다 (테스트 계정 3개는 재사용).
//
// 검증 항목:
//   0) 계정 준비
//   1) 매물 등록 → pickup_slots 확인
//   2) 제시가 ≥ 시작가 DB 제약 (insert/update 모두 거부)
//   3) §4 P5 카드 등록 바인딩 — 세션 없이/남의 customerKey로/재사용 세션으로 등록 불가,
//      오픈 리다이렉트 불가, 정상 경로는 통과
//   4) 수락 API 권한·에러 코드 (401 / 403 / TT409 / TT411)
//   5) §4 결제 체인 — 토스 성공 / 거절 / 예외 / 타임아웃 (+ 조회 실패) 경로
//   6) §4 P1 보상 처리 — 결제 후 확정 실패 → 결제 취소 → 되돌림 / 취소도 실패 → 상태 유지 + 기록
//   7) messages RLS (당사자 / 제3자 / anon)

import { spawn, execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { startMockToss } from "./lib/mock-toss.mjs";

// ---------- 0. 환경 변수 ----------
const REQUIRED_ENV = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_SELLER_EMAIL",
  "E2E_SELLER_PASSWORD",
  "E2E_BUYER_EMAIL",
  "E2E_BUYER_PASSWORD",
  "E2E_OUTSIDER_EMAIL",
  "E2E_OUTSIDER_PASSWORD",
];

function loadEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `필수 환경변수가 없어요: ${missing.join(", ")}\n` +
        `scripts/.env.example을 scripts/.env로 복사해서 채운 뒤 "pnpm e2e"로 실행하세요.`,
    );
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    webPort: Number(process.env.E2E_WEB_PORT || 3100),
    mockPort: Number(process.env.E2E_MOCK_TOSS_PORT || 4545),
    tossTimeoutMs: 1500,
    seller: { email: process.env.E2E_SELLER_EMAIL, password: process.env.E2E_SELLER_PASSWORD },
    buyer: { email: process.env.E2E_BUYER_EMAIL, password: process.env.E2E_BUYER_PASSWORD },
    outsider: { email: process.env.E2E_OUTSIDER_EMAIL, password: process.env.E2E_OUTSIDER_PASSWORD },
  };
}

// ---------- 로깅 / 단계 실행 헬퍼 ----------
let currentStep = "(시작 전)";
let passed = 0;

function log(msg) {
  console.log(msg);
}

async function step(label, fn) {
  currentStep = label;
  log(`\n▶ ${label}`);
  const result = await fn();
  passed += 1;
  log(`  OK`);
  return result;
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
  }
}

// 실패해야 정상인 동작(RLS 차단 등)을 검증할 때 쓴다 — 성공해버리면 그게 곧 실패다.
async function expectRejected(promise, label, expectedCode) {
  const { data, error } = await promise;
  if (!error) {
    throw new Error(`막아야 하는데 통과했어요: ${label} (받은 데이터: ${JSON.stringify(data)})`);
  }
  if (expectedCode && error.code !== expectedCode) {
    throw new Error(`${label}: 에러 코드 기대 ${expectedCode} / 실제 ${error.code} (${error.message})`);
  }
  log(`  - 예상대로 차단됨 (${label}): [${error.code}] ${error.message}`);
}

function expectEmpty(rows, label) {
  if ((rows ?? []).length !== 0) {
    throw new Error(`RLS가 막아야 하는데 ${rows.length}건이 보였어요: ${label}`);
  }
  log(`  - 예상대로 0건 조회됨 (${label})`);
}

// ---------- 사용자 준비 ----------
async function ensureUser(adminClient, email, password) {
  const { error } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !/already.*registered|already.*exists/i.test(error.message)) {
    throw error;
  }
}

async function signIn(supabaseUrl, publishableKey, email, password) {
  const client = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `${email} 로그인 실패: ${error.message} ` +
        `(계정이 이미 다른 비밀번호로 존재할 수 있어요 — Supabase Studio에서 확인하거나 계정을 지우고 재시도)`,
    );
  }
  return { client, userId: data.user.id, accessToken: data.session.access_token };
}

// ---------- apps/web 개발 서버 ----------
function startWebServer({ port, env }) {
  const child = spawn("pnpm", ["--filter", "@ttangttang/web", "exec", "next", "dev", "--port", String(port)], {
    env: { ...process.env, ...env },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  const tail = [];
  const collect = (buf) => {
    tail.push(...buf.toString("utf8").split(/\r?\n/));
    if (tail.length > 60) tail.splice(0, tail.length - 60);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  return {
    tail,
    stop() {
      if (child.exitCode !== null) return;
      try {
        if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
        else process.kill(-child.pid, "SIGTERM");
      } catch {
        // 이미 종료됨
      }
    },
  };
}

async function waitForWeb(origin, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${origin}/terms`);
      if (res.ok) return;
    } catch {
      // 아직 안 뜸
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`apps/web 개발 서버가 ${timeoutMs / 1000}초 안에 뜨지 않았어요 (${origin})`);
}

// ---------- main ----------
async function main() {
  const env = loadEnv();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const origin = `http://localhost:${env.webPort}`;
  const createdItemIds = [];
  const dummyTxIds = [];

  const mock = await startMockToss(env.mockPort);
  const web = startWebServer({
    port: env.webPort,
    env: {
      TOSS_API_BASE: mock.base,
      TOSS_TIMEOUT_MS: String(env.tossTimeoutMs),
      TOSS_SECRET_KEY: "test_sk_e2e_mock_never_sent_to_toss",
    },
  });

  try {
    await step(`0. 모의 토스(${mock.base}) + apps/web 개발 서버(${origin}) 기동`, async () => {
      await waitForWeb(origin);
      // 개발 서버는 라우트를 첫 요청 때 컴파일한다 — 타이밍 민감한 결제 테스트 전에 미리 데워둔다.
      await Promise.all([
        fetch(`${origin}/api/applications/00000000-0000-0000-0000-000000000000/accept`, { method: "POST" }),
        fetch(`${origin}/api/billing/session`, { method: "POST" }),
        fetch(`${origin}/api/billing/callback`, { redirect: "manual" }),
        fetch(`${origin}/pay/billing-auth`),
        fetch(`${origin}/pay/billing-done?ok=0`),
      ]);
    });

    await step("0. 테스트 계정 준비 (판매자/구매자/제3자)", async () => {
      await ensureUser(admin, env.seller.email, env.seller.password);
      await ensureUser(admin, env.buyer.email, env.buyer.password);
      await ensureUser(admin, env.outsider.email, env.outsider.password);
    });

    const seller = await step("0. 판매자 로그인", () =>
      signIn(env.supabaseUrl, env.publishableKey, env.seller.email, env.seller.password),
    );
    const buyer = await step("0. 구매자 로그인", () =>
      signIn(env.supabaseUrl, env.publishableKey, env.buyer.email, env.buyer.password),
    );
    const outsider = await step("0. 제3자 로그인", () =>
      signIn(env.supabaseUrl, env.publishableKey, env.outsider.email, env.outsider.password),
    );

    // ---------- 공통 헬퍼 ----------
    const pickupSlots = ["오늘 저녁 7시 이후", "내일 오전 10~12시"];

    async function createItem(label, startPrice = 1000) {
      const { data, error } = await seller.client
        .from("items")
        .insert({
          seller_id: seller.userId,
          title: `[e2e] ${label} ${new Date().toISOString()}`,
          description: "e2e-flow.mjs가 생성한 테스트 매물입니다.",
          start_price: startPrice,
          pickup_slots: pickupSlots,
          neighborhood: "테스트동네",
        })
        .select("id,pickup_slots,start_price")
        .single();
      if (error) throw error;
      createdItemIds.push(data.id);
      return data;
    }

    async function apply(user, itemId, offerPrice) {
      const { data, error } = await user.client
        .from("applications")
        .insert({
          item_id: itemId,
          applicant_id: user.userId,
          offer_price: offerPrice,
          visit_time: pickupSlots[0],
          message: "e2e-flow.mjs 테스트 지원입니다.",
        })
        .select("id,status,offer_price")
        .single();
      if (error) throw error;
      return data;
    }

    // 매물 1개 + 구매자 지원서 1개. 결제 시나리오를 orderId(= application.id)에 건다.
    async function newCase(label, scenario) {
      const item = await createItem(label);
      const app = await apply(buyer, item.id, 2000);
      if (scenario) mock.state.scenarios.set(app.id, scenario);
      return { itemId: item.id, appId: app.id };
    }

    async function accept(appId, accessToken) {
      const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
      const started = Date.now();
      const res = await fetch(`${origin}/api/applications/${appId}/accept`, { method: "POST", headers });
      const json = await res.json().catch(() => ({}));
      return { status: res.status, json, ms: Date.now() - started };
    }

    async function dbState(itemId, appId) {
      const [item, app, tx, inc] = await Promise.all([
        admin.from("items").select("status").eq("id", itemId).single(),
        admin.from("applications").select("status").eq("id", appId).single(),
        admin.from("transactions").select("id,status,toss_payment_key,amount").eq("application_id", appId).maybeSingle(),
        admin.from("payment_incidents").select("kind,payment_key").eq("application_id", appId),
      ]);
      for (const r of [item, app, tx, inc]) if (r.error) throw r.error;
      return {
        item: item.data.status,
        app: app.data.status,
        tx: tx.data,
        incidents: inc.data.map((i) => i.kind),
      };
    }

    // ---------- 1) 매물 등록 ----------
    const baseItem = await step("1. 판매자 매물 등록 (시작가 1,000원, 슬롯 2개) → 구매자 시점 pickup_slots 확인", async () => {
      const item = await createItem("기본 매물");
      const { data, error } = await buyer.client.from("items").select("pickup_slots").eq("id", item.id).single();
      if (error) throw error;
      assertEq(JSON.stringify(data.pickup_slots), JSON.stringify(pickupSlots), "pickup_slots");
      log(`  - item_id = ${item.id}`);
      return item;
    });

    // ---------- 2) 제시가 ≥ 시작가 ----------
    await step("2. [제약] 시작가 미만 제시가로 지원 → DB가 거부 (23514)", async () => {
      await expectRejected(
        buyer.client.from("applications").insert({
          item_id: baseItem.id,
          applicant_id: buyer.userId,
          offer_price: 500,
          visit_time: pickupSlots[0],
        }),
        "offer_price 500 < start_price 1000",
        "23514",
      );
    });

    await step("2. [제약] 지원 후 제시가를 시작가 미만으로 수정 → DB가 거부 (23514)", async () => {
      const app = await apply(buyer, baseItem.id, 1000);
      await expectRejected(
        buyer.client.from("applications").update({ offer_price: 999 }).eq("id", app.id).select(),
        "offer_price 1000 → 999",
        "23514",
      );
      const { data } = await admin.from("applications").select("offer_price").eq("id", app.id).single();
      assertEq(data.offer_price, 1000, "수정 거부 후 offer_price");
    });

    // ---------- 3) §4 P5 카드 등록 바인딩 ----------
    const VICTIM_KEY = "e2e-victim-original-billing-key";
    await admin.from("billing_keys").upsert({ profile_id: outsider.userId, billing_key: VICTIM_KEY });

    async function victimKey() {
      const { data } = await admin.from("billing_keys").select("billing_key").eq("profile_id", outsider.userId).single();
      return data.billing_key;
    }

    async function createSession(accessToken, clientRedirect) {
      const res = await fetch(`${origin}/api/billing/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ clientRedirect }),
      });
      return { status: res.status, json: await res.json().catch(() => ({})) };
    }

    async function callback(qs) {
      const res = await fetch(`${origin}/api/billing/callback?${qs}`, { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      return new URL(location, origin).searchParams;
    }

    await step("3. [P5] 토큰 없이 카드 등록 세션 발급 → 401", async () => {
      const r = await createSession(null, "ttangttang://");
      assertEq(r.status, 401, "status");
    });

    await step("3. [P5] 허용되지 않은 clientRedirect(https://evil) → 400", async () => {
      const r = await createSession(buyer.accessToken, "https://evil.example/steal");
      assertEq(r.status, 400, "status");
    });

    await step("3. [P5] 세션 없이 남의 customerKey로 콜백 → 거부, 피해자 빌링키 그대로", async () => {
      const p = await callback(`customerKey=${outsider.userId}&authKey=mock-auth-attacker`);
      assertEq(p.get("ok"), "0", "ok");
      assertEq(p.get("reason"), "missing_params", "reason");
      assertEq(await victimKey(), VICTIM_KEY, "피해자 billing_key");
    });

    await step("3. [P5] 내 세션 + 남의 customerKey로 콜백 → customer_mismatch, 피해자 빌링키 그대로", async () => {
      const r = await createSession(buyer.accessToken, "ttangttang://");
      assertEq(r.status, 200, "세션 발급 status");
      const sessionId = new URL(r.json.url).searchParams.get("session");
      const p = await callback(`session=${sessionId}&customerKey=${outsider.userId}&authKey=mock-auth-attacker`);
      assertEq(p.get("ok"), "0", "ok");
      assertEq(p.get("reason"), "customer_mismatch", "reason");
      assertEq(await victimKey(), VICTIM_KEY, "피해자 billing_key");
    });

    await step("3. [P5] 옛 방식 URL(/pay/billing-auth?customerKey=남의UUID) → 카드 등록 화면 안 열림", async () => {
      const html = await (await fetch(`${origin}/pay/billing-auth?customerKey=${outsider.userId}`)).text();
      assert(html.includes("만료"), "세션 없는 요청인데 만료 안내가 보이지 않아요");
      assert(!html.includes("js.tosspayments.com"), "세션 없는 요청인데 토스 SDK를 불러와요");
    });

    await step("3. [P5] 정상 경로: 내 세션 + 내 customerKey → 빌링키 저장, 세션 재사용은 거부", async () => {
      const r = await createSession(buyer.accessToken, "ttangttang://");
      const sessionId = new URL(r.json.url).searchParams.get("session");

      const authHtml = await (await fetch(r.json.url)).text();
      assert(authHtml.includes(buyer.userId), "billing-auth 페이지가 세션 주인의 customerKey를 쓰지 않아요");

      const p = await callback(`session=${sessionId}&customerKey=${buyer.userId}&authKey=mock-auth-ok`);
      assertEq(p.get("ok"), "1", "ok");
      const { data } = await admin.from("billing_keys").select("billing_key").eq("profile_id", buyer.userId).single();
      assertEq(data.billing_key, `mock_bk_${buyer.userId}`, "구매자 billing_key");

      const replay = await callback(`session=${sessionId}&customerKey=${buyer.userId}&authKey=mock-auth-ok`);
      assertEq(replay.get("reason"), "session_invalid", "재사용 reason");
    });

    await step("3. [P5] billing-done은 쿼리의 clientRedirect를 무시하고 세션에 저장된 딥링크로만 보냄", async () => {
      const html = await (
        await fetch(`${origin}/pay/billing-done?ok=1&clientRedirect=${encodeURIComponent("https://evil.example")}`)
      ).text();
      const hrefs = [...html.matchAll(/<a[^>]*href="([^"]*)"/g)].map((m) => m[1]);
      assert(hrefs.length > 0, "앱으로 돌아가기 링크가 없어요");
      assert(
        hrefs.every((h) => !h.startsWith("https://evil")),
        `evil로 가는 링크가 있어요: ${hrefs.join(", ")}`,
      );
      assert(hrefs.some((h) => h.startsWith("ttangttang://")), `앱 딥링크가 없어요: ${hrefs.join(", ")}`);
    });

    // ---------- 4) 수락 API 권한·에러 코드 ----------
    await step("4. 토큰 없이 수락 → 401", async () => {
      const c = await newCase("권한-401");
      assertEq((await accept(c.appId, null)).status, 401, "status");
    });

    await step("4. 판매자가 아닌 사람이 수락 → 403 (42501), 상태 그대로", async () => {
      const c = await newCase("권한-403");
      const r = await accept(c.appId, buyer.accessToken);
      assertEq(r.status, 403, "status");
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "pending", "application");
      assertEq(s.item, "live", "item");
    });

    await step("4. [P8] 철회된 지원서 수락 → 409 TT409 '방금 철회됐어요'", async () => {
      const c = await newCase("에러코드-TT409");
      // 철회 RPC 대신 상태만 바꾼다 — 테스트 계정에 철회 이력(30일 3회 제한)이 쌓이지 않게.
      await admin.from("applications").update({ status: "withdrawn" }).eq("id", c.appId);
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 409, "status");
      assertEq(r.json.code, "TT409", "code");
      log(`  - ${r.json.error}`);
    });

    // ---------- 5) 결제 체인 4경로 ----------
    const success = await step("5. [토스 성공] 200 → transaction paid, item awarded, 멱등키 전송", async () => {
      const c = await newCase("결제-성공", "success");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 200, `status (${JSON.stringify(r.json)})`);
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "accepted", "application");
      assertEq(s.item, "awarded", "item");
      assertEq(s.tx?.status, "paid", "transaction");
      assertEq(s.tx.toss_payment_key, `mock_pk_${c.appId}`, "payment_key");
      assertEq(s.tx.amount, 2000, "amount");
      const charge = mock.state.charges.find((ch) => ch.orderId === c.appId);
      assertEq(charge?.idempotencyKey, `charge-${c.appId}`, "Idempotency-Key");
      assertEq(s.incidents.length, 0, "incidents");
      return { ...c, txId: s.tx.id };
    });

    await step("5. [P8] 이미 낙찰된 지원서 재수락 → 409 TT411, 추가 결제 없음", async () => {
      const chargesBefore = mock.state.charges.length;
      const r = await accept(success.appId, seller.accessToken);
      assertEq(r.status, 409, "status");
      assertEq(r.json.code, "TT411", "code");
      assertEq(mock.state.charges.length, chargesBefore, "토스 결제 호출 수");
      log(`  - ${r.json.error}`);
    });

    await step("5. [토스 거절] 402 → payment_failed, item live 복원, transaction 없음", async () => {
      const c = await newCase("결제-거절", "decline");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 402, "status");
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "payment_failed", "application");
      assertEq(s.item, "live", "item");
      assertEq(s.tx, null, "transaction");
      assertEq(s.incidents.length, 0, "incidents");
      log(`  - reason: ${r.json.reason}`);
    });

    await step("5. [P2 토스 예외] 연결 끊김, 실제론 결제됨 → orderId 조회로 복구해 낙찰 확정", async () => {
      const c = await newCase("결제-예외", "exception");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 200, `status (${JSON.stringify(r.json)})`);
      assert(mock.state.lookups.includes(c.appId), "orderId 조회를 하지 않았어요");
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "accepted", "application");
      assertEq(s.item, "awarded", "item");
      assertEq(s.tx?.toss_payment_key, `mock_pk_${c.appId}`, "조회로 얻은 payment_key");
    });

    await step("5. [P2 토스 타임아웃] 응답 없음, 결제 없음 → 되돌림 + 대조용 기록", async () => {
      const c = await newCase("결제-타임아웃", "timeout");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 402, `status (${JSON.stringify(r.json)})`);
      assert(r.ms >= env.tossTimeoutMs, `타임아웃(${env.tossTimeoutMs}ms)보다 빨리 끝났어요: ${r.ms}ms`);
      assert(mock.state.lookups.includes(c.appId), "orderId 조회를 하지 않았어요");
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "payment_failed", "application");
      assertEq(s.item, "live", "item");
      assertEq(s.tx, null, "transaction");
      assertEq(JSON.stringify(s.incidents), JSON.stringify(["charge_unknown_not_found"]), "incidents");
      log(`  - ${r.ms}ms 후 응답`);
    });

    await step("5. [P2 타임아웃 + 조회도 실패] → 502, 되돌림 + 미해결 기록", async () => {
      const c = await newCase("결제-타임아웃-조회실패", "timeout_lookup_fail");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 502, `status (${JSON.stringify(r.json)})`);
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "payment_failed", "application");
      assertEq(s.item, "live", "item");
      assertEq(JSON.stringify(s.incidents), JSON.stringify(["charge_unknown_unresolved"]), "incidents");
    });

    // ---------- 6) §4 P1 보상 처리 ----------
    // finalize를 실패시키는 방법: 같은 매물에 다른 지원서로 된 transaction을 미리 넣어두면
    // finalize의 transactions insert가 unique(item_id) 위반으로 실패한다.
    async function caseWithFinalizeFailure(label, scenario) {
      const c = await newCase(label, scenario);
      const other = await apply(outsider, c.itemId, 1000);
      const { data, error } = await admin
        .from("transactions")
        .insert({
          item_id: c.itemId,
          application_id: other.id,
          buyer_id: outsider.userId,
          seller_id: seller.userId,
          amount: 1000,
          toss_payment_key: "e2e-dummy-conflict",
          pickup_deadline: new Date(Date.now() + 86_400_000).toISOString(),
        })
        .select("id")
        .single();
      if (error) throw error;
      dummyTxIds.push(data.id);
      return c;
    }

    await step("6. [P1] 결제 성공 → 확정 실패 → 결제 취소(멱등키) → 되돌림", async () => {
      const c = await caseWithFinalizeFailure("보상-취소성공", "success");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 500, "status");
      const cancel = mock.state.cancels.find((x) => x.paymentKey === `mock_pk_${c.appId}`);
      assert(cancel?.ok, "결제 취소가 호출되지 않았어요");
      assertEq(cancel.idempotencyKey, `cancel-mock_pk_${c.appId}`, "취소 Idempotency-Key");
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "payment_failed", "application");
      assertEq(s.item, "live", "item");
      assertEq(JSON.stringify(s.incidents), JSON.stringify(["finalize_failed_canceled"]), "incidents");
      log(`  - ${r.json.error}`);
    });

    await step("6. [P1] 결제 성공 → 확정 실패 → 취소도 실패 → 상태 유지(이중 결제 방지) + 수동 처리 기록", async () => {
      const c = await caseWithFinalizeFailure("보상-취소실패", "success_cancel_fail");
      const r = await accept(c.appId, seller.accessToken);
      assertEq(r.status, 500, "status");
      assertEq(r.json.code, "NEEDS_REVIEW", "code");
      const s = await dbState(c.itemId, c.appId);
      assertEq(s.app, "accepted", "application");
      assertEq(s.item, "awarded", "item");
      assertEq(JSON.stringify(s.incidents), JSON.stringify(["finalize_failed_cancel_failed"]), "incidents");
    });

    // ---------- 7) messages RLS ----------
    const anon = createClient(env.supabaseUrl, env.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const txId = success.txId;

    await step("7. 구매자 → 메시지 삽입 / 판매자 → 조회", async () => {
      const { error } = await buyer.client
        .from("messages")
        .insert({ tx_id: txId, sender_id: buyer.userId, body: "e2e: 구매자 메시지입니다." });
      if (error) throw error;
      const { data, error: e2 } = await seller.client.from("messages").select("sender_id").eq("tx_id", txId);
      if (e2) throw e2;
      assert(data.some((m) => m.sender_id === buyer.userId), "판매자가 구매자 메시지를 못 봤어요");
    });

    await step("7. 판매자 → 메시지 삽입 / 구매자 → 조회 (양방향)", async () => {
      const { error } = await seller.client
        .from("messages")
        .insert({ tx_id: txId, sender_id: seller.userId, body: "e2e: 판매자 메시지입니다." });
      if (error) throw error;
      const { data, error: e2 } = await buyer.client.from("messages").select("sender_id").eq("tx_id", txId);
      if (e2) throw e2;
      assert(data.length >= 2 && data.some((m) => m.sender_id === seller.userId), "구매자가 양쪽 메시지를 못 봤어요");
    });

    await step("7. 제3자 → 조회/삽입 차단", async () => {
      const { data, error } = await outsider.client.from("messages").select("id").eq("tx_id", txId);
      if (error) throw error;
      expectEmpty(data, "제3자 조회");
      await expectRejected(
        outsider.client.from("messages").insert({ tx_id: txId, sender_id: outsider.userId, body: "몰래" }),
        "제3자 삽입",
      );
    });

    await step("7. anon → 조회/삽입 차단", async () => {
      const { data, error } = await anon.from("messages").select("id").eq("tx_id", txId);
      if (error) throw error;
      expectEmpty(data, "anon 조회");
      await expectRejected(
        anon.from("messages").insert({ tx_id: txId, sender_id: buyer.userId, body: "위장" }),
        "anon 삽입",
      );
    });

    log(`\n모든 단계 통과 (${passed}개).`);
  } catch (err) {
    console.error(`\n실패 지점: ${currentStep}`);
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    console.error(`\n--- apps/web 로그 (마지막 60줄) ---\n${web.tail.join("\n")}`);
    process.exitCode = 1;
  } finally {
    await cleanup(admin, createdItemIds, dummyTxIds).catch((e) => console.error("정리 실패:", e.message));
    web.stop();
    await mock.close();
  }
}

// 이번 실행에서 만든 행만 지운다 (FK 역순).
async function cleanup(admin, itemIds, dummyTxIds) {
  if (itemIds.length === 0) return;
  const { data: apps } = await admin.from("applications").select("id").in("item_id", itemIds);
  const appIds = (apps ?? []).map((a) => a.id);
  const { data: txs } = await admin.from("transactions").select("id").in("item_id", itemIds);
  const txIds = [...new Set([...(txs ?? []).map((t) => t.id), ...dummyTxIds])];
  if (txIds.length) await admin.from("messages").delete().in("tx_id", txIds);
  if (appIds.length) await admin.from("payment_incidents").delete().in("application_id", appIds);
  if (txIds.length) await admin.from("transactions").delete().in("id", txIds);
  await admin.from("applications").delete().in("item_id", itemIds);
  await admin.from("items").delete().in("id", itemIds);
  console.log(`\n정리: 매물 ${itemIds.length}건, 지원서 ${appIds.length}건, 거래 ${txIds.length}건 삭제`);
}

main();
