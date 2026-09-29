#!/usr/bin/env node
// scripts/seed-demo-data.mjs가 만든 데모 데이터를 한 번에 지운다 — 매물/지원서/거래/알림 +
// 데모 계정 4개(판매자 1 + 구매자 3)까지 전부 삭제한다(계정을 남기려면
// scripts/lib/demo-data.mjs의 wipeDemoTradeData만 따로 쓸 것).
//
// 실행: pnpm cleanup:demo   (= node --env-file=scripts/.env scripts/cleanup-demo-data.mjs)
//
// 식별: 이메일이 "@ttangttang.demo"로 끝나는 auth.users만 대상으로 한다(scripts/lib/demo-data.mjs
// DEMO_EMAIL_DOMAIN). e2e/verify 스크립트의 "@ttangttang.test" 계정은 건드리지 않는다.

import { createClient } from "@supabase/supabase-js";
import { findAllDemoUserIds, wipeDemoTradeData, DEMO_EMAIL_DOMAIN } from "./lib/demo-data.mjs";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function loadEnv() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `필수 환경변수가 없어요: ${missing.join(", ")}\nscripts/.env.example을 scripts/.env로 복사해서 채운 뒤 실행하세요.`,
    );
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function main() {
  const env = loadEnv();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`▶ @${DEMO_EMAIL_DOMAIN} 계정 조회`);
  const users = await findAllDemoUserIds(admin);
  if (users.length === 0) {
    console.log("데모 계정이 없어요 — 지울 게 없습니다.");
    return;
  }
  console.log(`  ${users.length}개 계정: ${users.map((u) => u.email).join(", ")}`);

  const profileIds = users.map((u) => u.id);

  console.log("▶ 매물/지원서/거래/알림 삭제");
  await wipeDemoTradeData(admin, profileIds);

  console.log("▶ 계정 삭제 (profiles/billing_keys/blocks 등은 cascade)");
  for (const u of users) {
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) throw new Error(`${u.email} 삭제 실패: ${error.message}`);
    console.log(`  - ${u.email} 삭제됨`);
  }

  console.log("\n✅ 데모 데이터 전부 삭제 완료");
}

main().catch((err) => {
  console.error("\n❌ 실패:", err.message ?? err);
  process.exit(1);
});
