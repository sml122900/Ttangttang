#!/usr/bin/env node
// 4단계(사진업로드+AI 어시스트 → 수령시한 → 수령확인 → 노쇼 cron → 수령률 → 푸시 →
// settings/payment → 매물 수정·삭제) DB/API 로직 검증. verify-stage3.mjs와 같은 이유로
// pnpm e2e와 분리했다 — throwaway 계정을 매번 새로 만든다.
//
// 실행: node --env-file=scripts/.env scripts/verify-stage4.mjs  (= pnpm verify:stage4)

import { spawn, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { startMockToss } from "./lib/mock-toss.mjs";

function loadEnv() {
  const required = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`필수 환경변수가 없어요: ${missing.join(", ")}`);
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    webPort: Number(process.env.E2E_WEB_PORT || 3102),
    mockPort: Number(process.env.E2E_MOCK_TOSS_PORT || 4547),
  };
}

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
  log("  OK");
  return result;
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}
function assertEq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
}

async function ensureUser(admin, email, password) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return data.user.id;
}
async function signIn(supabaseUrl, publishableKey, email, password) {
  const client = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client, userId: data.user.id, accessToken: data.session.access_token };
}

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
    if (tail.length > 80) tail.splice(0, tail.length - 80);
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
  throw new Error(`apps/web 개발 서버가 뜨지 않았어요 (${origin})`);
}

// 1x1 흰 픽셀 PNG — 스토리지 업로드/AI 어시스트 경로 검증용(실제 인식 품질은 상관없음).
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function main() {
  const env = loadEnv();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const origin = `http://localhost:${env.webPort}`;
  const createdItemIds = [];
  const cleanupUserIds = [];
  const storagePaths = [];

  const mock = await startMockToss(env.mockPort);
  const web = startWebServer({
    port: env.webPort,
    env: {
      TOSS_API_BASE: mock.base,
      TOSS_TIMEOUT_MS: "1500",
      TOSS_SECRET_KEY: "test_sk_verify_stage4_mock_never_sent_to_toss",
    },
  });

  try {
    await step("0. apps/web 개발 서버 기동", () => waitForWeb(origin));

    async function freshUser(label) {
      const email = `verify4-${label}-${randomUUID().slice(0, 8)}@ttangttang.test`;
      const password = "verify-test-password-1!";
      const userId = await ensureUser(admin, email, password);
      cleanupUserIds.push(userId);
      const signed = await signIn(env.supabaseUrl, env.publishableKey, email, password);
      return { ...signed, email, password };
    }

    const seller = await step("0. 판매자 계정 준비", () => freshUser("seller"));
    const buyer = await step("0. 구매자 계정 준비", () => freshUser("buyer"));
    const outsider = await step("0. 제3자 계정 준비", () => freshUser("outsider"));

    async function dbTx(txId) {
      const { data, error } = await admin
        .from("transactions")
        .select("id,status,buyer_confirmed_at,seller_confirmed_at,completed_at,pickup_deadline")
        .eq("id", txId)
        .single();
      if (error) throw error;
      return data;
    }
    async function dbItem(itemId) {
      const { data, error } = await admin.from("items").select("*").eq("id", itemId).single();
      if (error) throw error;
      return data;
    }
    async function dbProfile(profileId) {
      const { data, error } = await admin.from("profiles").select("trade_count,receive_rate").eq("id", profileId).single();
      if (error) throw error;
      return data;
    }
    async function notificationsFor(recipientId, kind) {
      const { data, error } = await admin
        .from("notifications")
        .select("id,kind,title,sent_at")
        .eq("recipient_id", recipientId)
        .eq("kind", kind);
      if (error) throw error;
      return data;
    }

    // ============ 1) 수령시한 + 매물 수정·삭제 ============
    const item = await step("1. 매물 등록 (수령시한 48시간)", async () => {
      const { data, error } = await seller.client
        .from("items")
        .insert({
          seller_id: seller.userId,
          title: `[verify4] 매물 ${Date.now()}`,
          description: "verify-stage4.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          pickup_deadline_hours: 48,
          neighborhood: "테스트동네",
        })
        .select("id,pickup_deadline_hours")
        .single();
      if (error) throw error;
      createdItemIds.push(data.id);
      assertEq(data.pickup_deadline_hours, 48, "pickup_deadline_hours");
      return data;
    });

    await step("1. [RLS] 제3자는 남의 매물을 수정할 수 없음", async () => {
      const before = await dbItem(item.id);
      const { error, data } = await outsider.client
        .from("items")
        .update({ title: "해킹 시도" })
        .eq("id", item.id)
        .select();
      // RLS 위반은 에러 없이 0 rows로 돌아온다(권한 있는 행이 없어 WHERE에 안 걸림) — 둘 다 확인.
      if (error) throw error;
      assertEq((data ?? []).length, 0, "제3자 update 영향받은 행 수");
      const after = await dbItem(item.id);
      assertEq(after.title, before.title, "title 변경 안 됨");
    });

    await step("1. 판매자 본인은 제목·수령시한 수정 가능", async () => {
      const { error } = await seller.client
        .from("items")
        .update({ title: "수정된 제목", pickup_deadline_hours: 72 })
        .eq("id", item.id);
      if (error) throw error;
      const fresh = await dbItem(item.id);
      assertEq(fresh.title, "수정된 제목", "title");
      assertEq(fresh.pickup_deadline_hours, 72, "pickup_deadline_hours");
    });

    await step("1. [불변] 시작가는 등록 후 못 바꿈 (23514)", async () => {
      const { error } = await seller.client.from("items").update({ start_price: 3000 }).eq("id", item.id);
      assert(error, "시작가 변경이 막혀야 하는데 통과했어요");
      assertEq(error.code, "23514", "error code");
    });

    // ============ 2) 지원 → 수락(결제) → 수령시한 반영 확인 ============
    await admin.from("billing_keys").upsert({ profile_id: buyer.userId, billing_key: "verify4-buyer-fake-key" });

    const application = await step("2. 구매자 지원", async () => {
      const { data, error } = await buyer.client
        .from("applications")
        .insert({ item_id: item.id, applicant_id: buyer.userId, offer_price: 1000, visit_time: "아무때나" })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    });

    await step("2. [알림] 지원 도착 시 판매자에게 notifications 적재", async () => {
      const rows = await notificationsFor(seller.userId, "application_received");
      assert(rows.some((r) => r.title.includes("새 지원서")), "application_received 알림이 없어요");
    });

    const accepted = await step("2. 수락(결제) → transaction.pickup_deadline이 72시간 기준", async () => {
      mock.state.scenarios.set(application.id, "success");
      const res = await fetch(`${origin}/api/applications/${application.id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${seller.accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`accept 실패: ${JSON.stringify(json)}`);
      const tx = await dbTx(json.transaction.id);
      const hoursUntil = (new Date(tx.pickup_deadline).getTime() - Date.now()) / (1000 * 60 * 60);
      assert(hoursUntil > 71 && hoursUntil <= 72, `pickup_deadline이 72시간 근처가 아니에요: ${hoursUntil.toFixed(2)}h`);
      return { txId: json.transaction.id };
    });

    await step("2. [알림] 낙찰 시 구매자 'awarded' + 판매자 'award_confirmed'", async () => {
      const buyerRows = await notificationsFor(buyer.userId, "awarded");
      const sellerRows = await notificationsFor(seller.userId, "award_confirmed");
      assert(buyerRows.length > 0, "구매자 낙찰 알림이 없어요");
      assert(sellerRows.length > 0, "판매자 낙찰확정 알림이 없어요");
    });

    // ============ 3) 수령 확인 (구매자+판매자 이중 체크) ============
    await step("3. 제3자는 수령 확인 불가 (42501)", async () => {
      const { error } = await outsider.client.rpc("confirm_pickup", { p_transaction_id: accepted.txId });
      assert(error, "제3자 확인이 막혀야 하는데 통과했어요");
      assertEq(error.code, "42501", "error code");
    });

    await step("3. 구매자만 확인 → 아직 paid, 판매자 확인 대기", async () => {
      const { error } = await buyer.client.rpc("confirm_pickup", { p_transaction_id: accepted.txId });
      if (error) throw error;
      const tx = await dbTx(accepted.txId);
      assertEq(tx.status, "paid", "status");
      assert(tx.buyer_confirmed_at, "buyer_confirmed_at이 비어있어요");
      assertEq(tx.seller_confirmed_at, null, "seller_confirmed_at");
    });

    await step("3. 판매자까지 확인 → completed 전이 + items.status='completed' + 수령률/거래횟수 갱신", async () => {
      const { error } = await seller.client.rpc("confirm_pickup", { p_transaction_id: accepted.txId });
      if (error) throw error;
      const [tx, itemRow, buyerProfile, sellerProfile] = await Promise.all([
        dbTx(accepted.txId),
        dbItem(item.id),
        dbProfile(buyer.userId),
        dbProfile(seller.userId),
      ]);
      assertEq(tx.status, "completed", "tx.status");
      assert(tx.completed_at, "completed_at이 비어있어요");
      assertEq(itemRow.status, "completed", "items.status");
      assertEq(buyerProfile.trade_count, 1, "buyer trade_count");
      assertEq(sellerProfile.trade_count, 1, "seller trade_count");
      assertEq(buyerProfile.receive_rate, 100, "buyer receive_rate (완료 1/1)");
    });

    await step("3. 이미 완료된 거래를 다시 확인하려 하면 TT430", async () => {
      const { error } = await buyer.client.rpc("confirm_pickup", { p_transaction_id: accepted.txId });
      assert(error, "완료된 거래 재확인이 막혀야 하는데 통과했어요");
      assertEq(error.code, "TT430", "error code");
    });

    // ============ 4) 매물 취소 → 대기 지원서 자동 거절 + 알림 ============
    const cancelCase = await step("4. 취소 테스트용 매물 + 대기 지원서 준비", async () => {
      const { data: it, error } = await seller.client
        .from("items")
        .insert({
          seller_id: seller.userId,
          title: `[verify4] 취소테스트 ${Date.now()}`,
          description: "verify-stage4.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          neighborhood: "테스트동네",
        })
        .select("id")
        .single();
      if (error) throw error;
      createdItemIds.push(it.id);
      const { data: app, error: appError } = await outsider.client
        .from("applications")
        .insert({ item_id: it.id, applicant_id: outsider.userId, offer_price: 1000, visit_time: "아무때나" })
        .select("id")
        .single();
      if (appError) throw appError;
      return { itemId: it.id, applicationId: app.id };
    });

    await step("4. 매물 취소(=삭제) → 대기 지원서 자동 거절 + 거절 알림", async () => {
      const { error } = await seller.client.from("items").update({ status: "cancelled" }).eq("id", cancelCase.itemId);
      if (error) throw error;
      const { data: app, error: appError } = await admin
        .from("applications")
        .select("status")
        .eq("id", cancelCase.applicationId)
        .single();
      if (appError) throw appError;
      assertEq(app.status, "rejected", "application status");
      const rows = await notificationsFor(outsider.userId, "application_rejected");
      assert(rows.length > 0, "거절 알림이 없어요");
    });

    // ============ 5) 노쇼 정산 ============
    const noshowCase = await step("5. 노쇼 케이스 준비 (수령시한이 이미 지난 paid 거래)", async () => {
      const { data: it, error } = await admin
        .from("items")
        .insert({
          seller_id: seller.userId,
          title: `[verify4] 노쇼테스트 ${Date.now()}`,
          description: "verify-stage4.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          status: "awarded",
          neighborhood: "테스트동네",
        })
        .select("id")
        .single();
      if (error) throw error;
      createdItemIds.push(it.id);

      const { data: app, error: appError } = await admin
        .from("applications")
        .insert({
          item_id: it.id,
          applicant_id: buyer.userId,
          offer_price: 1000,
          visit_time: "아무때나",
          status: "accepted",
        })
        .select("id")
        .single();
      if (appError) throw appError;

      const { data: tx, error: txError } = await admin
        .from("transactions")
        .insert({
          item_id: it.id,
          application_id: app.id,
          buyer_id: buyer.userId,
          seller_id: seller.userId,
          amount: 1000,
          toss_payment_key: "verify4-noshow-fake",
          status: "paid",
          pickup_deadline: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1시간 전 = 이미 지남
        })
        .select("id")
        .single();
      if (txError) throw txError;
      return { txId: tx.id, itemId: it.id };
    });

    await step("5. settle_noshow_transactions() → noshow_settled + 양측 알림 + 수령률 재계산(1/2=50)", async () => {
      const { error } = await admin.rpc("settle_noshow_transactions");
      if (error) throw error;
      const [tx, buyerProfile, buyerRows, sellerRows] = await Promise.all([
        dbTx(noshowCase.txId),
        dbProfile(buyer.userId),
        notificationsFor(buyer.userId, "noshow_buyer"),
        notificationsFor(seller.userId, "noshow_seller"),
      ]);
      assertEq(tx.status, "noshow_settled", "status");
      assertEq(buyerProfile.receive_rate, 50, "buyer receive_rate (완료 1건 + 노쇼 1건 = 50%)");
      assert(buyerRows.length > 0, "구매자 노쇼 알림이 없어요");
      assert(sellerRows.length > 0, "판매자 노쇼 알림이 없어요");
    });

    // ============ 6) 알림 발송(pg_net) — DB 장부 기록 확인 ============
    await step("6. send_pending_notifications(): 토큰 있는/없는 수신자 모두 sent_at 채워짐", async () => {
      await admin.from("push_tokens").upsert({ profile_id: buyer.userId, expo_push_token: "ExponentPushToken[verify-stage4-fake]" });
      // seller에게는 토큰을 등록하지 않는다 — "토큰 없음" 경로도 같이 검증.
      const { error } = await admin.rpc("send_pending_notifications");
      if (error) throw error;
      const { data: unsent, error: unsentError } = await admin
        .from("notifications")
        .select("id")
        .in("recipient_id", [buyer.userId, seller.userId])
        .is("sent_at", null);
      if (unsentError) throw unsentError;
      assertEq(unsent.length, 0, "아직 안 보낸(sent_at null) 알림 수");
    });

    // ============ 7) settings/payment 카드 관리 ============
    await step("7. get_my_card_info(): billing_keys 행은 있지만 카드 메타는 비어있을 수 있음(폴백)", async () => {
      const { data, error } = await buyer.client.rpc("get_my_card_info").maybeSingle();
      if (error) throw error;
      assert(data, "billing_keys 행이 있는데 get_my_card_info가 아무것도 못 찾았어요");
      assertEq(data.card_company, null, "card_company (mock 등록이라 없음이 정상)");
    });

    await step("7. delete_billing_key(): 내 카드만 지울 수 있고, 지운 뒤엔 조회도 비어있음", async () => {
      const { error } = await buyer.client.rpc("delete_billing_key");
      if (error) throw error;
      const { data: hasKey } = await buyer.client.rpc("has_billing_key");
      assertEq(hasKey, false, "has_billing_key");
      const { data: info } = await buyer.client.rpc("get_my_card_info").maybeSingle();
      assertEq(info, null, "get_my_card_info");
    });

    // ============ 8) 사진 업로드(Storage RLS) + AI 어시스트 ============
    const buf = Buffer.from(TINY_PNG_BASE64, "base64");
    const myPath = `${buyer.userId}/verify4-${Date.now()}.png`;
    storagePaths.push(myPath);

    await step("8. [Storage] 본인 폴더 업로드 성공 + 공개 읽기 가능", async () => {
      const { error } = await buyer.client.storage.from("item-photos").upload(myPath, buf, { contentType: "image/png" });
      if (error) throw error;
      const { data } = buyer.client.storage.from("item-photos").getPublicUrl(myPath);
      const res = await fetch(data.publicUrl);
      assertEq(res.status, 200, "공개 URL 상태 코드");
      return data.publicUrl;
    });

    await step("8. [Storage RLS] 남의 폴더에는 업로드 불가", async () => {
      const otherPath = `${seller.userId}/verify4-attack-${Date.now()}.png`;
      const { error } = await buyer.client.storage.from("item-photos").upload(otherPath, buf, { contentType: "image/png" });
      assert(error, "남의 폴더 업로드가 막혀야 하는데 통과했어요");
    });

    const { data: publicUrlData } = buyer.client.storage.from("item-photos").getPublicUrl(myPath);

    await step("8. [AI 어시스트] 토큰 없이 호출 → 401", async () => {
      const res = await fetch(`${origin}/api/items/ai-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrlData.publicUrl }),
      });
      assertEq(res.status, 401, "status");
    });

    await step("8. [AI 어시스트] 우리 버킷이 아닌 외부 URL → 400 (SSRF 방지)", async () => {
      const res = await fetch(`${origin}/api/items/ai-assist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${buyer.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: "https://example.com/evil.png" }),
      });
      assertEq(res.status, 400, "status");
    });

    await step(
      "8. [AI 어시스트] 정상 인증 + 우리 버킷 이미지 → ANTHROPIC_API_KEY 미설정으로 502(수동입력 폴백 경로)",
      async () => {
        const res = await fetch(`${origin}/api/items/ai-assist`, {
          method: "POST",
          headers: { Authorization: `Bearer ${buyer.accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: publicUrlData.publicUrl }),
        });
        const json = await res.json();
        // ANTHROPIC_API_KEY가 이 환경에 없다 — 502로 실패하는 것 자체가 "AI 실패 → 수동입력
        // 폴백" 계약이 지켜진다는 뜻이다. 키가 있는 환경에서는 200을 기대한다(수동 확인 필요,
        // docs/launch-audit.md에 기록).
        assertEq(res.status, 502, `status (${JSON.stringify(json)})`);
        log(`  - (키 미설정) 502로 폴백 확인: ${json.error}`);
      },
    );

    log(`\n모든 단계 통과 (${passed}개).`);
  } catch (err) {
    console.error(`\n실패 지점: ${currentStep}`);
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    console.error(`\n--- apps/web 로그 (마지막 80줄) ---\n${web.tail.join("\n")}`);
    process.exitCode = 1;
  } finally {
    await cleanup(admin, createdItemIds, cleanupUserIds, storagePaths).catch((e) => console.error("정리 실패:", e.message));
    web.stop();
    await mock.close();
  }
}

async function cleanup(admin, itemIds, userIds, storagePaths) {
  if (itemIds.length) {
    const { data: apps } = await admin.from("applications").select("id").in("item_id", itemIds);
    const appIds = (apps ?? []).map((a) => a.id);
    const { data: txs } = await admin.from("transactions").select("id").in("item_id", itemIds);
    const txIds = (txs ?? []).map((t) => t.id);
    if (txIds.length) await admin.from("messages").delete().in("tx_id", txIds);
    if (appIds.length) await admin.from("payment_incidents").delete().in("application_id", appIds);
    if (txIds.length) await admin.from("transactions").delete().in("id", txIds);
    await admin.from("applications").delete().in("item_id", itemIds);
    await admin.from("items").delete().in("id", itemIds);
  }
  if (storagePaths.length) await admin.storage.from("item-photos").remove(storagePaths);
  if (userIds.length) await admin.from("notifications").delete().in("recipient_id", userIds);
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\n정리: 매물 ${itemIds.length}건, 스토리지 파일 ${storagePaths.length}건, throwaway 계정 ${userIds.length}명 삭제`);
}

main();
