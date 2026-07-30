#!/usr/bin/env node
// 땅땅 핵심 플로우(§3 PROJECT.md) 폰 없이 검증하는 E2E 스크립트.
//
// 실행:
//   node --env-file=scripts/.env scripts/e2e-flow.mjs
// (scripts/.env는 scripts/.env.example을 복사해서 채울 것 — 커밋되지 않음, .gitignore의
//  `.env` 패턴에 이미 걸린다)
//
// SKIP_CHARGE (기본값 true):
//   - true(기본): accept API를 호출하지 않는다. 3단계는 판매자의 application 목록 조회까지만
//     검증하고, 4단계(messages RLS)에 쓸 transaction은 service role로 직접 만든다. 토스 공식
//     문서상 빌링 승인 테스트에는 실카드 정보가 필요해서("테스트용 국내 카드번호는 없어요"),
//     그 정보를 이 스크립트/.env에 평문으로 두지 않기 위한 기본값이다. 실제 결제창 승인·
//     인앱 복귀 확인은 폰 E2E에서 같이 한다.
//   - false: accept API → 토스 실제 결제(charge) → finalize까지 검증한다. TOSS_SECRET_KEY와
//     TEST_CARD_* 값이 전부 필요하다 (scripts/.env.example 참고, 실카드 정보 필요).
//
// 사전조건:
//   - apps/web 개발 서버가 WEB_ORIGIN에서 떠 있어야 한다 (`pnpm web:dev`, 기본 포트 3000).
//     SKIP_CHARGE=false로 돌릴 때만 필요 — apps/web/.env에 TOSS_SECRET_KEY(test_sk_...)가
//     설정돼 있어야 accept API의 실제 결제 체인(paymentGateway.chargeBilling)이 통과한다.
//   - Supabase는 클라우드 프로젝트를 그대로 쓴다 (CLAUDE.md 참고, 로컬 Docker 아님).
//   - 이 스크립트는 재실행 가능하다: 매 실행마다 새 item/application/transaction을
//     만들 뿐 기존 테스트 계정을 재사용하므로 데이터가 누적된다 (정리가 필요하면
//     Supabase Studio에서 직접 지울 것).
//
// 4단계 (요청 순서 그대로):
//   1) 판매자 로그인 → 매물 등록(슬롯 2개) → item_id 확인
//   2) 구매자 로그인 → item의 pickup_slots가 API 응답에 정확히 들어있는지 확인 →
//      (SKIP_CHARGE=false일 때만 테스트 빌링키 발급) → 지원서 제출 → application_id 확인
//   3) 판매자 로그인 → application 목록 조회 →
//      SKIP_CHARGE=true: 여기서 멈추고 4단계용 transaction만 service role로 직접 생성
//      SKIP_CHARGE=false: accept API 호출 → 결제 체인(finalize) 성공 확인 → transaction 생성 확인
//   4) 양쪽 계정으로 messages 삽입/조회 → RLS가 당사자만 허용하는지, 제3자/anon은
//      막히는지 확인 (transaction은 3단계 결과를 그대로 사용 — 결제 여부와 무관)

import { createClient } from "@supabase/supabase-js";

// ---------- 0. 환경 변수 ----------
const BASE_REQUIRED_ENV = [
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

// 결제(charge)까지 검증할 때만(SKIP_CHARGE=false) 필요 — 토스 공식 문서상 빌링 승인
// 테스트에는 실카드 정보가 필요해서("테스트용 국내 카드번호는 없어요"), 기본값에서는 요구하지 않는다.
const CHARGE_REQUIRED_ENV = [
  "TOSS_SECRET_KEY",
  "TEST_CARD_NUMBER",
  "TEST_CARD_EXP_YEAR",
  "TEST_CARD_EXP_MONTH",
  "TEST_CARD_PASSWORD",
  "TEST_CARD_BIRTH",
];

function loadEnv() {
  // 기본값은 스킵(true) — 명시적으로 "false"를 줘야 accept API의 실제 결제까지 검증한다.
  const skipCharge = process.env.SKIP_CHARGE !== "false";
  const required = BASE_REQUIRED_ENV.concat(skipCharge ? [] : CHARGE_REQUIRED_ENV);
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `필수 환경변수가 없어요: ${missing.join(", ")}\n` +
        `scripts/.env.example을 scripts/.env로 복사해서 채운 뒤 ` +
        `"node --env-file=scripts/.env scripts/e2e-flow.mjs"로 실행하세요.`,
    );
  }
  return {
    skipCharge,
    supabaseUrl: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    webOrigin: process.env.WEB_ORIGIN || "http://localhost:3000",
    tossSecretKey: process.env.TOSS_SECRET_KEY,
    seller: { email: process.env.E2E_SELLER_EMAIL, password: process.env.E2E_SELLER_PASSWORD },
    buyer: { email: process.env.E2E_BUYER_EMAIL, password: process.env.E2E_BUYER_PASSWORD },
    outsider: { email: process.env.E2E_OUTSIDER_EMAIL, password: process.env.E2E_OUTSIDER_PASSWORD },
    testCard: {
      number: process.env.TEST_CARD_NUMBER,
      expYear: process.env.TEST_CARD_EXP_YEAR,
      expMonth: process.env.TEST_CARD_EXP_MONTH,
      password: process.env.TEST_CARD_PASSWORD,
      birth: process.env.TEST_CARD_BIRTH,
    },
  };
}

// ---------- 로깅 / 단계 실행 헬퍼 ----------
let currentStep = "(시작 전)";

function log(msg) {
  console.log(msg);
}

async function step(label, fn) {
  currentStep = label;
  log(`\n▶ ${label}`);
  const result = await fn();
  log(`  OK`);
  return result;
}

function skipStep(label, reason) {
  log(`\n▶ ${label}`);
  log(`  SKIP (${reason})`);
}

// 실패해야 정상인 동작(RLS 차단)을 검증할 때 쓴다 — 성공해버리면 그게 곧 실패다.
async function expectRejected(promise, label) {
  const { data, error } = await promise;
  if (!error) {
    throw new Error(`RLS가 막아야 하는데 통과했어요: ${label} (받은 데이터: ${JSON.stringify(data)})`);
  }
  log(`  - 예상대로 차단됨 (${label}): ${error.message}`);
}

function expectEmpty(rows, label) {
  if ((rows ?? []).length !== 0) {
    throw new Error(`RLS가 막아야 하는데 ${rows.length}건이 보였어요: ${label}`);
  }
  log(`  - 예상대로 0건 조회됨 (${label})`);
}

// ---------- 사용자 준비 ----------
async function ensureUser(adminClient, email, password) {
  const { error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
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

// 토스 API는 cardExpirationYear를 2자리(YY), cardExpirationMonth를 0으로 채운 2자리(MM)로
// 요구한다 (예: "28", "03"). .env에 4자리 연도("2028")나 패딩 없는 월("3")을 넣는 실수가 흔해서
// 여기서 방어적으로 정규화한다.
function normalizeExpiration(expYear, expMonth) {
  const year = String(expYear).trim();
  const month = String(expMonth).trim();
  return {
    year: year.length > 2 ? year.slice(-2) : year.padStart(2, "0"),
    month: month.padStart(2, "0"),
  };
}

// ---------- 토스 테스트 빌링키 발급 (인증 없이 카드정보로 발급하는 API) ----------
// 문서: POST /v1/billing/authorizations/card — test_sk_ 시크릿 키를 쓰면 실제로 존재하는
// 카드번호를 넣어도 가상 승인만 되고 실제 결제는 발생하지 않는다. 클라이언트가 아니라 스크립트가
// service-role처럼 서버 역할을 대신 하는 셈이라, apps/web의 issueBillingKey()와 동일한 결과(billingKey)를
// 웹뷰 없이 만들어낸다.
async function issueTestBillingKey(tossSecretKey, customerKey, card) {
  const { year, month } = normalizeExpiration(card.expYear, card.expMonth);
  const res = await fetch("https://api.tosspayments.com/v1/billing/authorizations/card", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${tossSecretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customerKey,
      cardNumber: card.number,
      cardExpirationYear: year,
      cardExpirationMonth: month,
      cardPassword: card.password,
      customerIdentityNumber: card.birth,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || typeof json.billingKey !== "string") {
    throw new Error(`토스 테스트 빌링키 발급 실패: ${json.code ?? res.status} ${json.message ?? ""}`);
  }
  return json.billingKey;
}

// ---------- main ----------
async function main() {
  const env = loadEnv();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await step("0. 테스트 계정 준비 (판매자/구매자/제3자)", async () => {
    await ensureUser(admin, env.seller.email, env.seller.password);
    await ensureUser(admin, env.buyer.email, env.buyer.password);
    await ensureUser(admin, env.outsider.email, env.outsider.password);
  });

  // ---------- 1) 판매자 로그인 → 매물 등록(슬롯 2개) → item_id 확인 ----------
  const seller = await step("1. 판매자 로그인", () =>
    signIn(env.supabaseUrl, env.publishableKey, env.seller.email, env.seller.password),
  );

  const pickupSlots = ["오늘 저녁 7시 이후", "내일 오전 10~12시"];
  const createdItem = await step("1. 매물 등록 (시작가 1,000원, 슬롯 2개)", async () => {
    const { data, error } = await seller.client
      .from("items")
      .insert({
        seller_id: seller.userId,
        title: `[e2e] 테스트 매물 ${new Date().toISOString()}`,
        description: "e2e-flow.mjs가 생성한 테스트 매물입니다.",
        start_price: 1000,
        pickup_slots: pickupSlots,
        neighborhood: "테스트동네",
      })
      .select("id,pickup_slots,start_price")
      .single();
    if (error) throw error;
    if (data.pickup_slots.length !== 2) {
      throw new Error(`슬롯이 2개가 아니에요: ${JSON.stringify(data.pickup_slots)}`);
    }
    log(`  - item_id = ${data.id}`);
    return data;
  });
  const itemId = createdItem.id;

  // ---------- 2) 구매자 로그인 → pickup_slots 확인 → 지원서 제출 → application_id 확인 ----------
  const buyer = await step("2. 구매자 로그인", () =>
    signIn(env.supabaseUrl, env.publishableKey, env.buyer.email, env.buyer.password),
  );

  const itemSeenByBuyer = await step("2. 구매자 시점에서 item 조회 → pickup_slots 검증", async () => {
    const { data, error } = await buyer.client
      .from("items")
      .select("id,start_price,pickup_slots,status")
      .eq("id", itemId)
      .single();
    if (error) throw error;
    const expected = JSON.stringify(pickupSlots);
    const actual = JSON.stringify(data.pickup_slots);
    if (actual !== expected) {
      throw new Error(`pickup_slots 불일치. 기대: ${expected} / 실제: ${actual}`);
    }
    log(`  - pickup_slots 일치 확인: ${actual}`);
    return data;
  });

  if (env.skipCharge) {
    skipStep("2. 구매자 빌링키 확인/발급", "SKIP_CHARGE=true — 결제 단계를 검증하지 않으므로 빌링키가 필요 없음");
  } else {
    await step("2. 구매자 빌링키 확인/발급 (테스트 빌링키, 실카드 필요)", async () => {
      const { data: hasKey, error } = await buyer.client.rpc("has_billing_key");
      if (error) throw error;
      if (hasKey) {
        log("  - 이미 빌링키 등록됨 (이전 실행에서 발급된 키 재사용)");
        return;
      }
      const billingKey = await issueTestBillingKey(env.tossSecretKey, buyer.userId, env.testCard);
      // billing_keys는 클라이언트 정책이 전혀 없는 테이블(RLS enable + 정책 0개 + 명시적 revoke) —
      // 실제 서비스에서는 apps/web의 billing callback이 service-role로 쓰는 경로를 그대로 흉내낸다.
      const { error: insertError } = await admin
        .from("billing_keys")
        .upsert({ profile_id: buyer.userId, billing_key: billingKey }, { onConflict: "profile_id" });
      if (insertError) throw insertError;
      log("  - 테스트 빌링키 발급 및 저장 완료");
    });
  }

  const application = await step("2. 지원서 제출", async () => {
    const { data, error } = await buyer.client
      .from("applications")
      .insert({
        item_id: itemId,
        applicant_id: buyer.userId,
        offer_price: itemSeenByBuyer.start_price,
        visit_time: itemSeenByBuyer.pickup_slots[0],
        message: "e2e-flow.mjs 테스트 지원입니다.",
      })
      .select("id,status,offer_price,visit_time")
      .single();
    if (error) throw error;
    log(`  - application_id = ${data.id} (offer_price=${data.offer_price}, status=${data.status})`);
    return data;
  });
  const applicationId = application.id;

  // ---------- 3) 판매자 로그인 → application 목록 조회 → accept → 결제 체인 확인 ----------
  const applicantList = await step("3. 판매자 시점에서 application 목록 조회", async () => {
    const { data, error } = await seller.client
      .from("applications")
      .select("id,offer_price,visit_time,status,applicant_id")
      .eq("item_id", itemId);
    if (error) throw error;
    const found = data.find((a) => a.id === applicationId);
    if (!found) throw new Error("방금 제출한 지원서가 판매자 목록에 보이지 않아요");
    if (found.status !== "pending") throw new Error(`지원서 상태가 pending이 아니에요: ${found.status}`);
    log(`  - ${data.length}건 조회됨, 대상 지원서 status=${found.status}`);
    return data;
  });
  void applicantList;

  let transactionId;
  if (env.skipCharge) {
    skipStep(
      "3. accept API 호출 (accept_application → 토스 결제 → finalize)",
      "SKIP_CHARGE=true — 결제 승인/인앱 복귀는 폰 E2E에서 검증 예정",
    );
    transactionId = await step(
      "3. [SKIP_CHARGE] 4단계 messages RLS 검증용 transaction을 service role로 직접 생성",
      async () => {
        const pickupDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        // accept_application()/finalize_accepted_application()을 거치지 않으므로 item/application
        // 상태는 live/pending 그대로다 — 여기서 검증하려는 건 오직 messages RLS(§4)뿐이라 문제 없다.
        const { data, error } = await admin
          .from("transactions")
          .insert({
            item_id: itemId,
            application_id: applicationId,
            buyer_id: buyer.userId,
            seller_id: seller.userId,
            amount: application.offer_price,
            toss_payment_key: "e2e-skip-charge-fake-payment-key",
            pickup_deadline: pickupDeadline,
          })
          .select("id")
          .single();
        if (error) throw error;
        log(`  - transaction_id = ${data.id} (결제 없이 직접 생성됨)`);
        return data.id;
      },
    );
  } else {
    transactionId = await step("3. accept API 호출 (accept_application → 토스 결제 → finalize)", async () => {
      let res;
      try {
        res = await fetch(`${env.webOrigin}/api/applications/${applicationId}/accept`, {
          method: "POST",
          headers: { Authorization: `Bearer ${seller.accessToken}` },
        });
      } catch (err) {
        throw new Error(
          `apps/web 서버(${env.webOrigin})에 연결할 수 없어요. "pnpm web:dev"로 먼저 띄웠는지 확인하세요. (${err.message})`,
        );
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = json.reason ? ` (${json.reason})` : "";
        throw new Error(`accept API 실패 (status=${res.status}): ${json.error ?? JSON.stringify(json)}${detail}`);
      }
      if (!json.transaction?.id) {
        throw new Error(`accept API 응답에 transaction.id가 없어요: ${JSON.stringify(json)}`);
      }
      log(`  - transaction_id = ${json.transaction.id}`);
      return json.transaction.id;
    });

    await step("3. 결제 체인 결과 검증 (transactions/items/applications 상태)", async () => {
      const [{ data: tx, error: txError }, { data: item, error: itemError }, { data: app, error: appError }] =
        await Promise.all([
          admin.from("transactions").select("*").eq("id", transactionId).single(),
          admin.from("items").select("status").eq("id", itemId).single(),
          admin.from("applications").select("status").eq("id", applicationId).single(),
        ]);
      if (txError) throw txError;
      if (itemError) throw itemError;
      if (appError) throw appError;
      if (tx.status !== "paid") throw new Error(`transaction.status가 paid가 아니에요: ${tx.status}`);
      if (item.status !== "awarded") throw new Error(`item.status가 awarded가 아니에요: ${item.status}`);
      if (app.status !== "accepted") throw new Error(`application.status가 accepted가 아니에요: ${app.status}`);
      log(`  - transaction.amount=${tx.amount}, item.status=${item.status}, application.status=${app.status}`);
    });
  }

  // ---------- 4) messages RLS 검증 ----------
  const outsider = await step("4. 제3자 계정 로그인 (RLS 음성 테스트용)", () =>
    signIn(env.supabaseUrl, env.publishableKey, env.outsider.email, env.outsider.password),
  );
  const anon = createClient(env.supabaseUrl, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await step("4. 구매자 → 메시지 삽입 / 판매자 → 조회", async () => {
    const { error: insertError } = await buyer.client
      .from("messages")
      .insert({ tx_id: transactionId, sender_id: buyer.userId, body: "e2e: 구매자 메시지입니다." });
    if (insertError) throw insertError;

    const { data: seenBySeller, error: selectError } = await seller.client
      .from("messages")
      .select("id,sender_id,body")
      .eq("tx_id", transactionId);
    if (selectError) throw selectError;
    if (!seenBySeller.some((m) => m.sender_id === buyer.userId)) {
      throw new Error("판매자가 구매자 메시지를 못 봤어요");
    }
    log(`  - 판매자가 ${seenBySeller.length}건 조회 (구매자 메시지 포함 확인)`);
  });

  await step("4. 판매자 → 메시지 삽입 / 구매자 → 조회 (양방향 확인)", async () => {
    const { error: insertError } = await seller.client
      .from("messages")
      .insert({ tx_id: transactionId, sender_id: seller.userId, body: "e2e: 판매자 메시지입니다." });
    if (insertError) throw insertError;

    const { data: seenByBuyer, error: selectError } = await buyer.client
      .from("messages")
      .select("id,sender_id,body")
      .eq("tx_id", transactionId);
    if (selectError) throw selectError;
    if (!seenByBuyer.some((m) => m.sender_id === seller.userId) || seenByBuyer.length < 2) {
      throw new Error(`구매자가 양쪽 메시지를 다 못 봤어요 (${seenByBuyer.length}건)`);
    }
    log(`  - 구매자가 ${seenByBuyer.length}건 조회 (양쪽 메시지 모두 확인)`);
  });

  await step("4. 제3자 계정 → 조회/삽입 차단 확인", async () => {
    const { data: rows, error } = await outsider.client.from("messages").select("id").eq("tx_id", transactionId);
    if (error) throw error;
    expectEmpty(rows, "제3자 계정 조회");

    await expectRejected(
      outsider.client
        .from("messages")
        .insert({ tx_id: transactionId, sender_id: outsider.userId, body: "e2e: 제3자가 몰래 보낸 메시지" }),
      "제3자 계정 삽입",
    );
  });

  await step("4. anon(비로그인) → 조회/삽입 차단 확인", async () => {
    const { data: rows, error } = await anon.from("messages").select("id").eq("tx_id", transactionId);
    if (error) throw error;
    expectEmpty(rows, "anon 조회");

    await expectRejected(
      anon.from("messages").insert({ tx_id: transactionId, sender_id: buyer.userId, body: "e2e: anon 위장 메시지" }),
      "anon 삽입 (구매자로 위장 시도)",
    );
  });

  log("\n모든 단계 통과.");
  log(
    JSON.stringify(
      {
        skipCharge: env.skipCharge,
        itemId,
        applicationId,
        transactionId,
        sellerId: seller.userId,
        buyerId: buyer.userId,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(`\n실패 지점: ${currentStep}`);
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
