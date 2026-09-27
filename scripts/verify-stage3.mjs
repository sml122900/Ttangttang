#!/usr/bin/env node
// 3단계(설정→계정 삭제→신고·차단→온보딩) DB 로직 검증. pnpm e2e와 별개로 둔 이유:
// 계정 삭제 테스트는 매번 새 throwaway 계정을 만들고 실제로 소프트 삭제(로그인 수단 무효화)
// 시키므로, pnpm e2e처럼 고정된 seller/buyer/outsider 계정을 재사용하는 구조와 맞지 않는다
// (재사용하면 그 계정들이 이후 모든 e2e 실행에서 로그인 불가능해진다).
//
// 실행: node --env-file=scripts/.env scripts/verify-stage3.mjs
// (scripts/.env는 pnpm e2e와 같은 파일을 쓴다 — SUPABASE_URL/PUBLISHABLE_KEY/SERVICE_ROLE_KEY만 필요)
//
// 검증 항목:
//   1) delete_own_account(): 진행 중(paid) 거래가 있으면 TT420으로 막힘
//   2) delete_own_account(): 정상 케이스 — live 매물 취소, billing_keys 삭제, profile 익명화
//   3) apps/web의 /api/account/delete까지 실행 — auth 소프트 삭제 후 로그인 불가 확인,
//      profiles 행은 살아있는지(물리적 cascade 삭제가 안 됐는지) 확인
//   4) block_user/unblock_user + items_select_public/applications_insert_own 상호 비노출

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
    webPort: Number(process.env.E2E_WEB_PORT || 3101),
    mockPort: Number(process.env.E2E_MOCK_TOSS_PORT || 4546),
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
function assertEq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`);
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
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
  throw new Error(`apps/web 개발 서버가 뜨지 않았어요 (${origin})`);
}

async function main() {
  const env = loadEnv();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const origin = `http://localhost:${env.webPort}`;
  const createdItemIds = [];
  const cleanupUserIds = [];

  const mock = await startMockToss(env.mockPort);
  const web = startWebServer({
    port: env.webPort,
    env: {
      TOSS_API_BASE: mock.base,
      TOSS_TIMEOUT_MS: "1500",
      TOSS_SECRET_KEY: "test_sk_verify_stage3_mock_never_sent_to_toss",
    },
  });

  try {
    await step("0. apps/web 개발 서버 기동", () => waitForWeb(origin));

    async function freshUser(label) {
      const email = `verify-${label}-${randomUUID().slice(0, 8)}@ttangttang.test`;
      const password = "verify-test-password-1!";
      const userId = await ensureUser(admin, email, password);
      cleanupUserIds.push(userId);
      const signed = await signIn(env.supabaseUrl, env.publishableKey, email, password);
      return { ...signed, email, password };
    }

    // ============ 1~3) 계정 삭제 ============
    const seller = await step("1. 판매자(진행 중 거래 보유) 계정 준비", () => freshUser("seller"));
    const buyer = await step("1. 구매자 계정 준비", () => freshUser("buyer"));

    const pendingItem = await step("1. 매물 등록 + 지원 + 수락(결제 완료, 아직 미수령)", async () => {
      const { data: item, error: itemError } = await seller.client
        .from("items")
        .insert({
          seller_id: seller.userId,
          title: `[verify] 진행중 거래 ${Date.now()}`,
          description: "verify-stage3.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          neighborhood: "테스트동네",
        })
        .select("id")
        .single();
      if (itemError) throw itemError;
      createdItemIds.push(item.id);

      const { error: bkError } = await admin
        .from("billing_keys")
        .upsert({ profile_id: buyer.userId, billing_key: "verify-stage3-buyer-fake-key" });
      if (bkError) throw bkError;

      const { data: application, error: appError } = await buyer.client
        .from("applications")
        .insert({ item_id: item.id, applicant_id: buyer.userId, offer_price: 1000, visit_time: "아무때나" })
        .select("id")
        .single();
      if (appError) throw appError;

      mock.state.scenarios.set(application.id, "success");
      const res = await fetch(`${origin}/api/applications/${application.id}/accept`, {
        method: "POST",
        headers: { Authorization: `Bearer ${seller.accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`accept 실패: ${JSON.stringify(json)}`);
      return { itemId: item.id, applicationId: application.id };
    });
    void pendingItem;

    await step("1. [돈] 진행 중(paid) 거래가 있는 판매자는 탈퇴 불가 (TT420)", async () => {
      const { error } = await seller.client.rpc("delete_own_account");
      assert(error, "탈퇴가 막혀야 하는데 성공했어요");
      assertEq(error.code, "TT420", "error code");
    });

    await step("1. [돈] 진행 중(paid) 거래가 있는 구매자도 탈퇴 불가 (TT420)", async () => {
      const { error } = await buyer.client.rpc("delete_own_account");
      assert(error, "탈퇴가 막혀야 하는데 성공했어요");
      assertEq(error.code, "TT420", "error code");
    });

    const cleanUser = await step("2. 진행 중 거래가 없는 계정 준비 (live 매물 + billing_key 보유)", async () => {
      const user = await freshUser("clean");
      const { data: item, error } = await user.client
        .from("items")
        .insert({
          seller_id: user.userId,
          title: `[verify] 탈퇴 테스트 매물 ${Date.now()}`,
          description: "verify-stage3.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          neighborhood: "테스트동네",
        })
        .select("id")
        .single();
      if (error) throw error;
      createdItemIds.push(item.id);
      const { error: bkError } = await admin
        .from("billing_keys")
        .upsert({ profile_id: user.userId, billing_key: "verify-stage3-fake-key" });
      if (bkError) throw bkError;
      return { ...user, itemId: item.id };
    });

    await step("2. [돈] delete_own_account() 정상 케이스: live 매물 취소 + billing_keys 삭제 + profile 익명화", async () => {
      const { error } = await cleanUser.client.rpc("delete_own_account");
      if (error) throw error;

      const [{ data: item }, { data: billingKey }, { data: profile }] = await Promise.all([
        admin.from("items").select("status").eq("id", cleanUser.itemId).single(),
        admin.from("billing_keys").select("profile_id").eq("profile_id", cleanUser.userId).maybeSingle(),
        admin.from("profiles").select("nickname,neighborhood").eq("id", cleanUser.userId).single(),
      ]);
      assertEq(item.status, "cancelled", "item.status");
      assertEq(billingKey, null, "billing_keys row (삭제됐어야 함)");
      assertEq(profile.nickname, "탈퇴한 사용자", "profile.nickname");
      assertEq(profile.neighborhood, "", "profile.neighborhood");
    });

    const softDeleteUser = await step("3. [소프트 삭제] apps/web /api/account/delete 전체 체인 실행", async () => {
      const user = await freshUser("softdelete");
      const res = await fetch(`${origin}/api/account/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(`삭제 실패: ${JSON.stringify(json)}`);
      return user;
    });

    await step("3. [소프트 삭제] profiles 행은 살아있음 (물리적 cascade로 지워지지 않았어야 함)", async () => {
      const { data, error } = await admin.from("profiles").select("id,nickname").eq("id", softDeleteUser.userId).maybeSingle();
      if (error) throw error;
      assert(data, "profiles 행이 사라졌어요 — auth.users 소프트 삭제가 cascade를 일으킨 것으로 보임");
      assertEq(data.nickname, "탈퇴한 사용자", "profile.nickname");
    });

    await step("3. [소프트 삭제] 같은 이메일/비밀번호로 재로그인 시도 → 실패해야 함", async () => {
      const client = createClient(env.supabaseUrl, env.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.signInWithPassword({
        email: softDeleteUser.email,
        password: softDeleteUser.password,
      });
      assert(!data.session && error, "소프트 삭제됐는데 재로그인이 성공했어요");
      log(`  - 예상대로 로그인 거부됨: ${error.message}`);
    });

    // ============ 4) 신고·차단 ============
    const alice = await step("4. 차단 테스트 — 이웃 A(alice) 계정 준비", () => freshUser("alice"));
    const bob = await step("4. 차단 테스트 — 이웃 B(bob) 계정 준비", () => freshUser("bob"));

    const aliceItem = await step("4. alice가 매물 등록", async () => {
      const { data, error } = await alice.client
        .from("items")
        .insert({
          seller_id: alice.userId,
          title: `[verify] alice의 매물 ${Date.now()}`,
          description: "verify-stage3.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          neighborhood: "테스트동네",
        })
        .select("id")
        .single();
      if (error) throw error;
      createdItemIds.push(data.id);
      return data;
    });

    await step("4. 차단 전: bob이 alice의 매물을 피드에서 볼 수 있음", async () => {
      const { data, error } = await bob.client.from("items").select("id").eq("id", aliceItem.id).maybeSingle();
      if (error) throw error;
      assert(data, "차단 전인데 매물이 안 보여요");
    });

    await step("4. bob이 alice를 차단 (block_user, 닉네임 스냅샷 확인)", async () => {
      const { error } = await bob.client.rpc("block_user", { p_blocked_id: alice.userId });
      if (error) throw error;
      const { data, error: selError } = await bob.client
        .from("blocks")
        .select("blocked_id,blocked_nickname")
        .eq("blocked_id", alice.userId)
        .single();
      if (selError) throw selError;
      assertEq(data.blocked_id, alice.userId, "blocked_id");
      assert(data.blocked_nickname.length > 0, "blocked_nickname이 비어있어요");
    });

    await step("4. [상호 비노출] 차단 후: bob이 alice의 매물을 못 봄", async () => {
      const { data, error } = await bob.client.from("items").select("id").eq("id", aliceItem.id).maybeSingle();
      if (error) throw error;
      assertEq(data, null, "차단했는데 매물이 여전히 보여요");
    });

    await step("4. [상호 비노출] 차단 후: alice도 bob 소유 매물 관점에서 서로 안 보임(역방향 정책 확인용 매물 생성)", async () => {
      const { data: bobItem, error } = await bob.client
        .from("items")
        .insert({
          seller_id: bob.userId,
          title: `[verify] bob의 매물 ${Date.now()}`,
          description: "verify-stage3.mjs",
          start_price: 1000,
          pickup_slots: ["아무때나"],
          neighborhood: "테스트동네",
        })
        .select("id")
        .single();
      if (error) throw error;
      createdItemIds.push(bobItem.id);

      const { data: seenByAlice, error: selError } = await alice.client
        .from("items")
        .select("id")
        .eq("id", bobItem.id)
        .maybeSingle();
      if (selError) throw selError;
      assertEq(seenByAlice, null, "bob이 alice를 차단하지 않았는데도(역방향) alice가 bob의 매물을 못 봐야 정상 — 상호 차단");
    });

    await step("4. [지원 차단] bob이 차단한 alice의 매물에 지원 시도 → 거부돼야 함", async () => {
      const { error } = await bob.client
        .from("applications")
        .insert({ item_id: aliceItem.id, applicant_id: bob.userId, offer_price: 1000, visit_time: "아무때나" });
      assert(error, "차단 관계인데 지원이 통과됐어요");
    });

    await step("4. unblock 후: 매물이 다시 보이고 지원도 가능함", async () => {
      const { error: unblockError } = await bob.client.rpc("unblock_user", { p_blocked_id: alice.userId });
      if (unblockError) throw unblockError;

      const { data: seen, error: selError } = await bob.client.from("items").select("id").eq("id", aliceItem.id).maybeSingle();
      if (selError) throw selError;
      assert(seen, "차단 해제했는데 매물이 안 보여요");

      const { error: appError } = await bob.client
        .from("applications")
        .insert({ item_id: aliceItem.id, applicant_id: bob.userId, offer_price: 1000, visit_time: "아무때나" });
      if (appError) throw new Error(`차단 해제 후 지원이 막혔어요: ${appError.message}`);

      const { data: blocksRow } = await bob.client.from("blocks").select("blocked_id").eq("blocked_id", alice.userId).maybeSingle();
      assertEq(blocksRow, null, "unblock 후에도 blocks 행이 남아있어요");
    });

    log(`\n모든 단계 통과 (${passed}개).`);
  } catch (err) {
    console.error(`\n실패 지점: ${currentStep}`);
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    console.error(`\n--- apps/web 로그 (마지막 60줄) ---\n${web.tail.join("\n")}`);
    process.exitCode = 1;
  } finally {
    await cleanup(admin, createdItemIds, cleanupUserIds).catch((e) => console.error("정리 실패:", e.message));
    web.stop();
    await mock.close();
  }
}

async function cleanup(admin, itemIds, userIds) {
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
  // 소프트 삭제 대상(softDeleteUser)을 포함해 이번 실행이 만든 계정은 전부 물리적으로 지운다 —
  // 이 스크립트가 만든 throwaway 계정이라 다음 실행에 영향을 주지 않는다.
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  console.log(`\n정리: 매물 ${itemIds.length}건, throwaway 계정 ${userIds.length}명 삭제`);
}

main();
