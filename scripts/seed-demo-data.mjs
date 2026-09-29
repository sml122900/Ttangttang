#!/usr/bin/env node
// 폰 체크 + 포트폴리오 스크린샷/데모 GIF용 데이터를 dev Supabase DB에 심는다.
//
// 실행: pnpm seed:demo   (= node --env-file=scripts/.env scripts/seed-demo-data.mjs)
// 재실행 가능 — 매번 데모 계정의 매물/지원서/거래를 지우고 새로 심는다(계정 자체는 재사용).
// 지우려면: pnpm cleanup:demo (scripts/cleanup-demo-data.mjs) — 계정까지 완전히 삭제한다.
//
// 만드는 것:
//   - 판매자 1명(닉네임 "소소한정리") + 구매자 3명, 전부 __DEV__ 이메일/비밀번호 로그인으로
//     폰에서 바로 로그인 가능 (이메일 도메인 @ttangttang.demo로 식별 — scripts/lib/demo-data.mjs 참고)
//   - 매물 5개(시작가·동네·지원자 수 다양), 사진은 scripts/fixtures/demo-photos/ (저작권 문제
//     없는 Wikimedia Commons 사진, 출처는 그 폴더의 README.md)
//   - 그중 "스탠드 나눔" 매물 1개에 지원서 3개 — 제시가·방문 시간·메시지·수령률을 일부러
//     다르게 줘서 "가장 비싼 사람"이 아니라 신뢰도 높은 지원자를 고르는 그림을 보여준다.
//
// 결제(수락→토스 청구)까지 실제로 성공시키려면 지원자 중 한 명 계정에 실제 카드 등록이 먼저
// 되어 있어야 한다(가짜 카드번호로는 토스 빌링키 발급 자체가 막힌다 —
// docs/troubleshooting/toss-billing-no-dedicated-test-card.md). docs/phone-check.md 맨 위
// 섹션에 어느 계정으로 등록할지 안내해뒀다.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  DEMO_SELLER,
  DEMO_BUYERS,
  ensureDemoAccounts,
  wipeDemoTradeData,
} from "./lib/demo-data.mjs";

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

async function uploadPhoto(admin, sellerId, localFile, storageName) {
  const bytes = readFileSync(`scripts/fixtures/demo-photos/${localFile}`);
  const path = `${sellerId}/${storageName}`;
  const { error } = await admin.storage.from("item-photos").upload(path, bytes, {
    contentType: "image/jpeg",
    upsert: true,
  });
  if (error) throw error;
  const { data } = admin.storage.from("item-photos").getPublicUrl(path);
  return data.publicUrl;
}

async function insertItem(admin, sellerId, fields) {
  const { data, error } = await admin
    .from("items")
    .insert({ seller_id: sellerId, status: "live", ...fields })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function insertApplication(admin, itemId, applicantId, fields) {
  const { error } = await admin.from("applications").insert({
    item_id: itemId,
    applicant_id: applicantId,
    status: "pending",
    ...fields,
  });
  if (error) throw error;
}

async function main() {
  const env = loadEnv();
  const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("▶ 데모 계정 준비");
  const ids = await ensureDemoAccounts(admin);
  const sellerId = ids[DEMO_SELLER.email];
  const buyerA = ids[DEMO_BUYERS.a.email];
  const buyerB = ids[DEMO_BUYERS.b.email];
  const buyerC = ids[DEMO_BUYERS.c.email];
  if (!sellerId || !buyerA || !buyerB || !buyerC) {
    throw new Error("계정 id를 못 찾았어요 — Supabase Studio에서 auth.users를 확인해보세요.");
  }

  console.log("▶ 프로필(동네·수령률) 갱신");
  await admin
    .from("profiles")
    .update({ neighborhood: DEMO_SELLER.neighborhood })
    .eq("id", sellerId);
  for (const [key, buyerId] of [
    ["a", buyerA],
    ["b", buyerB],
    ["c", buyerC],
  ]) {
    const buyer = DEMO_BUYERS[key];
    await admin
      .from("profiles")
      .update({ neighborhood: buyer.neighborhood, receive_rate: buyer.receiveRate })
      .eq("id", buyerId);
  }

  console.log("▶ 기존 데모 매물/지원서/거래 정리 (재시드 대비)");
  await wipeDemoTradeData(admin, [sellerId, buyerA, buyerB, buyerC]);

  console.log("▶ 사진 업로드");
  const lampUrl = await uploadPhoto(admin, sellerId, "lamp.jpg", "lamp.jpg");
  const tableUrl = await uploadPhoto(admin, sellerId, "table.jpg", "table.jpg");
  const booksUrl = await uploadPhoto(admin, sellerId, "books.jpg", "books.jpg");
  const pansUrl = await uploadPhoto(admin, sellerId, "pans.jpg", "pans.jpg");
  const plantUrl = await uploadPhoto(admin, sellerId, "plant.jpg", "plant.jpg");

  console.log("▶ 매물 등록");
  const featuredItemId = await insertItem(admin, sellerId, {
    title: "협탁 위에 놓던 스탠드 나눔해요",
    description:
      "이사하면서 정리하는 스탠드예요. 전구는 새 것으로 갈아뒀고 작동 잘 됩니다. 침대 옆이나 책상 위 어디에 둬도 예뻐요.",
    start_price: 3000,
    photos: [lampUrl],
    neighborhood: "역삼동",
    pickup_slots: ["오늘 저녁 7시 이후", "내일 오전 10~12시", "이번 주말 아무 때나"],
    pickup_deadline_hours: 48,
  });

  const tableItemId = await insertItem(admin, sellerId, {
    title: "원목 사이드테이블 드려요",
    description:
      "원목 사이드테이블이에요. 다리에 사용감이 조금 있지만 흔들림 없고 튼튼해요. 화분이나 협탁 대용으로 쓰기 좋아요.",
    start_price: 5000,
    photos: [tableUrl],
    neighborhood: "청담동",
    pickup_slots: ["이번 주 아무 때나 저녁"],
    pickup_deadline_hours: 72,
  });

  await insertItem(admin, sellerId, {
    title: "전공서적 박스째 나눔합니다",
    description: "경영/회계 관련 전공서적 여러 권이에요. 박스째 가져가실 분 편하게 지원해주세요.",
    start_price: 1000,
    photos: [booksUrl],
    neighborhood: "잠실동",
    pickup_slots: ["평일 저녁 아무 때나"],
    pickup_deadline_hours: 72,
  });

  const pansItemId = await insertItem(admin, sellerId, {
    title: "무쇠 프라이팬 세트 나눔",
    description: "무쇠 프라이팬 두 개 세트예요. 시즈닝 다시 하면 오래 쓰실 수 있어요. 무거운 건 감안해주세요.",
    start_price: 5000,
    photos: [pansUrl],
    neighborhood: "역삼동",
    pickup_slots: ["오늘 저녁", "내일 오전"],
    pickup_deadline_hours: 48,
  });

  const plantItemId = await insertItem(admin, sellerId, {
    title: "아마릴리스 화분 나눔해요 (꽃대 올라옴)",
    description: "아마릴리스 화분이에요. 지금 꽃대가 올라오고 있어서 곧 꽃 보실 수 있어요. 물만 잘 챙겨주시면 돼요.",
    start_price: 1000,
    photos: [plantUrl],
    neighborhood: "삼성동",
    pickup_slots: ["주말 오후"],
    pickup_deadline_hours: 72,
  });

  console.log("▶ 지원서 등록 (featured 매물 3건 + 나머지 매물 일부)");
  await insertApplication(admin, featuredItemId, buyerA, {
    offer_price: 3000,
    visit_time: "오늘 저녁 7시 이후",
    message: "아이 방에 놓을 스탠드 찾고 있었어요! 오늘 저녁에 바로 가지러 갈 수 있어요 :)",
  });
  await insertApplication(admin, featuredItemId, buyerB, {
    offer_price: 5000,
    visit_time: "이번 주말 아무 때나",
    message: "필요해서요",
  });
  await insertApplication(admin, featuredItemId, buyerC, {
    offer_price: 4000,
    visit_time: "내일 오전 10~12시",
    message: "책상 정리하다 보니 스탠드가 마침 필요했어요. 내일 오전에 방문 가능합니다, 감사해요!",
  });

  await insertApplication(admin, tableItemId, buyerB, {
    offer_price: 5000,
    visit_time: "이번 주 아무 때나 저녁",
    message: "지금 바로 가지러 갈 수 있어요",
  });

  await insertApplication(admin, pansItemId, buyerA, {
    offer_price: 5000,
    visit_time: "내일 오전",
    message: "프라이팬 딱 필요했어요, 감사합니다",
  });
  await insertApplication(admin, pansItemId, buyerC, {
    offer_price: 5500,
    visit_time: "오늘 저녁",
    message: "요리 좋아해서 무쇠팬 써보고 싶었어요!",
  });

  await insertApplication(admin, plantItemId, buyerA, {
    offer_price: 1000,
    visit_time: "주말 오후",
    message: "화분 키우는 거 좋아해요, 잘 키울게요",
  });

  console.log("\n✅ 데모 데이터 심기 완료");
  console.log(`   판매자: ${DEMO_SELLER.email} / ${DEMO_SELLER.password} (닉네임: ${DEMO_SELLER.nickname})`);
  console.log(`   featured 매물 id: ${featuredItemId}`);
  console.log("   docs/phone-check.md 맨 위 섹션대로 폰에서 로그인해서 확인하세요.");
}

main().catch((err) => {
  console.error("\n❌ 실패:", err.message ?? err);
  process.exit(1);
});
