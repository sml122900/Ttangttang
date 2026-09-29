// 폰 체크·포트폴리오 스크린샷용 데모 데이터 — scripts/seed-demo-data.mjs와
// scripts/cleanup-demo-data.mjs가 공유하는 계정 정의 + 정리 로직.
//
// 식별 태그: 데모 계정은 전부 "@ttangttang.demo" 이메일 도메인을 쓴다(e2e/verify 스크립트의
// "@ttangttang.test"와 겹치지 않게 별도 도메인). 매물/지원서는 seller_id/applicant_id로
// 이 계정들에 연결돼 있으므로 제목에 별도 프리픽스를 달 필요가 없다 — 스크린샷에 "[데모]" 같은
// 티가 안 난다.
export const DEMO_EMAIL_DOMAIN = "ttangttang.demo";

// 비밀번호는 scripts/.env의 DEMO_SELLER_PASSWORD에서만 읽는다 — 이 파일은 git에 커밋되므로
// 실제 값을 하드코딩하지 않는다(예전에 한 번 실수로 커밋했다가 회전한 적 있음, docs/decisions.md 참고).
export function buildDemoSeller(password) {
  return {
    email: `seller@${DEMO_EMAIL_DOMAIN}`,
    password,
    nickname: "소소한정리",
    neighborhood: "역삼동",
  };
}

// 셋 다 "featured" 매물(스탠드)에 지원한다 — 제시가·방문 슬롯·메시지·수령률을 일부러 다르게 줘서
// "가장 비싼 제시가"가 아니라 신뢰도 높은 지원자가 선택되는 그림을 한 화면에서 보여준다.
export function buildDemoBuyers(password) {
  return {
    a: {
      email: `buyer-a@${DEMO_EMAIL_DOMAIN}`,
      password,
      nickname: "도윤맘",
      neighborhood: "역삼동",
      receiveRate: 100,
    },
    b: {
      email: `buyer-b@${DEMO_EMAIL_DOMAIN}`,
      password,
      nickname: "저녁마실",
      neighborhood: "청담동",
      receiveRate: 78, // 일부러 낮춤 — "제일 비싸게 부른 사람"이 신뢰도는 제일 낮은 시나리오
    },
    c: {
      email: `buyer-c@${DEMO_EMAIL_DOMAIN}`,
      password,
      nickname: "책벌레지수",
      neighborhood: "잠실동",
      receiveRate: 100,
    },
  };
}

// ---------- 계정 준비 ----------
export async function ensureDemoAccounts(admin, password) {
  if (!password) {
    throw new Error("DEMO_SELLER_PASSWORD가 필요해요 — scripts/.env에 채워주세요.");
  }
  const seller = buildDemoSeller(password);
  const buyers = buildDemoBuyers(password);
  const ids = {};
  for (const acc of [seller, ...Object.values(buyers)]) {
    const { data, error } = await admin.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
      user_metadata: { name: acc.nickname },
    });
    if (error && !/already.*registered|already.*exists/i.test(error.message)) {
      throw error;
    }
    ids[acc.email] = data?.user?.id ?? (await findUserIdByEmail(admin, acc.email));
  }
  return ids;
}

export async function findUserIdByEmail(admin, email) {
  // listUsers는 이메일 필터가 없어 도메인으로 걸러 전량 훑는다 — 데모 계정 4개뿐이라 충분하다.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

export async function findAllDemoUserIds(admin) {
  const found = [];
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      if (u.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`)) found.push({ id: u.id, email: u.email });
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return found;
}

// ---------- 거래 데이터 정리 (계정은 남기고 매물/지원서/거래만 지움 — 재시드 전 초기화용) ----------
export async function wipeDemoTradeData(admin, profileIds) {
  if (profileIds.length === 0) return;

  const { data: items } = await admin.from("items").select("id").in("seller_id", profileIds);
  const itemIds = (items ?? []).map((i) => i.id);

  if (itemIds.length > 0) {
    const { data: txs } = await admin.from("transactions").select("id").in("item_id", itemIds);
    const txIds = (txs ?? []).map((t) => t.id);
    if (txIds.length > 0) {
      await admin.from("messages").delete().in("tx_id", txIds);
      await admin.from("transactions").delete().in("id", txIds);
    }

    const { data: apps } = await admin.from("applications").select("id").in("item_id", itemIds);
    const appIds = (apps ?? []).map((a) => a.id);
    if (appIds.length > 0) {
      await admin.from("payment_incidents").delete().in("application_id", appIds);
    }
    await admin.from("applications").delete().in("item_id", itemIds);
  }
  // 데모 구매자가 데모 매물 밖에서 지원한 적은 없어야 정상이지만, 안전하게 한 번 더 정리.
  await admin.from("applications").delete().in("applicant_id", profileIds);

  await admin.from("notifications").delete().in("recipient_id", profileIds);
  await admin.from("reports").delete().in("reporter_id", profileIds);

  if (itemIds.length > 0) {
    await admin.from("items").delete().in("id", itemIds);
  }
}
