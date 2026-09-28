#!/usr/bin/env node
// 6단계 — 스토어용 화면 목업 5장. **주의: 실기기/시뮬레이터 캡처가 아니라 실제 컴포넌트
// 코드(apps/mobile/src/components/*, 각 화면 파일)의 색상·문구를 그대로 옮겨 그린 목업이다.**
// react-native-web으로 실제 앱을 렌더링해 캡처하려 했으나 이 프로젝트의 NativeWind/RN-web
// 조합에서 런타임 에러("Cannot manually set... StyleSheet.setFlag")가 나 막혔다 — 새로 파고들
// 사안이라 이번 범위에서는 보류하고(§ 새로 발견한 리스크), 대신 정확한 목업으로 스토어 등록
// 작업을 막지 않게 했다. 제출 전 `docs/phone-check.md`의 실기기 확인 때 진짜 스크린샷으로
// 교체할 것.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const C = {
  brand: "#4059C8",
  brandPress: "#3348A8",
  brandTint: "#EEF1FC",
  point: "#0BA05C",
  pointTint: "#E8F7F0",
  ink: "#191F28",
  ink2: "#333D4B",
  sub: "#6B7684",
  sub2: "#8B95A1",
  line: "#E5E8EB",
  lineSoft: "#F2F4F6",
  surfaceWarm: "#FDFBF7",
  surfaceMoney: "#FFFFFF",
  danger: "#E5503C",
  stamp: "#FF6B4A",
};

const W = 390;
const H = 844;
const FONT = "Malgun Gothic, sans-serif";

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function statusBar() {
  return `
    <rect width="${W}" height="54" fill="transparent"/>
    <text x="24" y="34" font-size="15" font-weight="700" fill="${C.ink}" font-family="${FONT}">9:41</text>
    <rect x="${W - 60}" y="22" width="36" height="14" rx="3" fill="none" stroke="${C.ink}" stroke-width="1.5"/>
    <rect x="${W - 58}" y="24" width="26" height="10" rx="1.5" fill="${C.ink}"/>
  `;
}

function chip(x, y, text, tone) {
  const tones = {
    live: [C.brandTint, C.brand],
    quiet: [C.lineSoft, C.sub],
    green: [C.pointTint, C.point],
  };
  const [bg, fg] = tones[tone];
  const w = text.length * 7.6 + 20;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="22" rx="6" fill="${bg}"/>
    <text x="${x + w / 2}" y="${y + 15}" font-size="11.5" font-weight="700" fill="${fg}" text-anchor="middle" font-family="${FONT}">${esc(text)}</text>
  `;
}

function ticket(x, y, amount, label) {
  return `
    <g>
      <rect x="${x}" y="${y}" width="86" height="52" rx="10" fill="${C.brand}"/>
      <line x1="${x + 12}" y1="${y + 8}" x2="${x + 12}" y2="${y + 44}" stroke="rgba(255,255,255,0.45)" stroke-width="1.5" stroke-dasharray="3,3"/>
      <circle cx="${x + 12}" cy="${y}" r="4" fill="#FFFFFF"/>
      <circle cx="${x + 12}" cy="${y + 52}" r="4" fill="#FFFFFF"/>
      <text x="${x + 55}" y="${y + 27}" font-size="14.5" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="${FONT}">${esc(amount)}</text>
      <text x="${x + 55}" y="${y + 41}" font-size="9.5" font-weight="600" fill="#FFFFFF" opacity="0.8" text-anchor="middle" font-family="${FONT}">${esc(label)}</text>
    </g>
  `;
}

function itemRow(y, thumb, title, meta, chipText, chipTone, amount, ticketLabel) {
  return `
    <rect x="20" y="${y}" width="76" height="76" rx="12" fill="#F9FAFB" stroke="${C.lineSoft}"/>
    <text x="58" y="${y + 46}" font-size="26" text-anchor="middle">${thumb}</text>
    <clipPath id="titleClip${y}"><rect x="110" y="${y}" width="168" height="60"/></clipPath>
    <text x="110" y="${y + 24}" font-size="14.5" font-weight="700" fill="${C.ink}" font-family="${FONT}" clip-path="url(#titleClip${y})">${esc(title)}</text>
    <text x="110" y="${y + 44}" font-size="11" fill="${C.sub2}" font-family="${FONT}" clip-path="url(#titleClip${y})">${esc(meta)}</text>
    ${chip(110, y + 52, chipText, chipTone)}
    ${ticket(W - 106, y + 12, amount, ticketLabel)}
  `;
}

function frame(inner, label) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${C.surfaceWarm}"/>
    ${inner}
  </svg>`;
  return svg;
}

// ---------- 1) 홈 피드 ----------
const screen1 = frame(`
  ${statusBar()}
  <text x="20" y="88" font-size="19" font-weight="800" fill="${C.ink}" font-family="${FONT}">땅땅</text>
  <rect x="20" y="102" width="${W - 40}" height="62" rx="16" fill="${C.brandTint}"/>
  <rect x="34" y="116" width="34" height="34" rx="10" fill="#FFFFFF"/>
  <text x="51" y="138" font-size="12" font-weight="800" fill="${C.brand}" text-anchor="middle" font-family="${FONT}">땅땅</text>
  <text x="80" y="130" font-size="14" font-weight="700" fill="${C.ink}" font-family="${FONT}">땅땅 치고 데려가세요</text>
  <text x="80" y="148" font-size="12" fill="${C.sub}" font-family="${FONT}">지원서는 공짜 · 결제는 낙찰 순간</text>
  <text x="20" y="196" font-size="13" font-weight="700" fill="${C.sub2}" font-family="${FONT}">우리 동네 나눔</text>
  <rect x="0" y="210" width="${W}" height="${H - 210}" fill="#FFFFFF"/>
  ${itemRow(228, "📦", "이케아 협탁, 거의 새 거", "행당동 · 5분 전 · 시작가 1,000원", "지원 3명", "live", "3,000원", "최고 제시")}
  <line x1="0" y1="322" x2="${W}" y2="322" stroke="${C.lineSoft}"/>
  ${itemRow(340, "📚", "자료구조 전공서 4권 일괄", "행당동 · 32분 전 · 시작가 3,000원", "아직 지원 없음 — 선점 기회", "quiet", "3,000원", "시작가")}
  <line x1="0" y1="434" x2="${W}" y2="434" stroke="${C.lineSoft}"/>
  ${itemRow(452, "🍳", "3구 인덕션 프라이팬 세트", "마장동 · 2시간 전 · 시작가 5,000원", "지원 1명", "live", "5,000원", "최고 제시")}
`);

// ---------- 2) 매물 상세 ----------
const safetySteps = [
  ["1", "지원은 공짜예요", "카드만 등록하고 지원해요. 지원 단계에서는 돈이 빠지지 않아요."],
  ["2", "낙찰되면 그 순간 자동 결제", "판매자가 내 지원서를 수락하면 등록된 카드로 즉시 결제돼요."],
  ["3", "노쇼 시 자동 정산", "약속 시간 내 수령하지 않으면 결제금 전액이 위약금으로 지급돼요."],
];
const screen2 = frame(`
  ${statusBar()}
  <circle cx="40" cy="80" r="18" fill="none"/>
  <text x="28" y="88" font-size="20" fill="${C.ink}" font-family="${FONT}">←</text>
  <rect x="0" y="106" width="${W}" height="220" fill="#FFFFFF"/>
  <text x="${W / 2}" y="230" font-size="64" text-anchor="middle">📦</text>
  <text x="20" y="356" font-size="19" font-weight="800" fill="${C.ink}" font-family="${FONT}">원목 사이드 테이블</text>
  <text x="20" y="378" font-size="13" fill="${C.sub2}" font-family="${FONT}">행당동</text>
  <rect x="20" y="396" width="${W - 40}" height="66" rx="16" fill="#FFFFFF" stroke="${C.line}"/>
  <text x="${20 + (W - 40) / 6}" y="418" font-size="11.5" fill="${C.sub2}" text-anchor="middle" font-family="${FONT}">시작가</text>
  <text x="${20 + (W - 40) / 6}" y="440" font-size="15" font-weight="800" fill="${C.ink}" text-anchor="middle" font-family="${FONT}">1,000원</text>
  <line x1="${20 + (W - 40) / 3}" y1="404" x2="${20 + (W - 40) / 3}" y2="454" stroke="${C.lineSoft}"/>
  <text x="${20 + (W - 40) / 2}" y="418" font-size="11.5" fill="${C.sub2}" text-anchor="middle" font-family="${FONT}">현재 최고</text>
  <text x="${20 + (W - 40) / 2}" y="440" font-size="15" font-weight="800" fill="${C.brand}" text-anchor="middle" font-family="${FONT}">3,000원</text>
  <line x1="${20 + (W - 40) * 2 / 3}" y1="404" x2="${20 + (W - 40) * 2 / 3}" y2="454" stroke="${C.lineSoft}"/>
  <text x="${20 + (W - 40) * 5 / 6}" y="418" font-size="11.5" fill="${C.sub2}" text-anchor="middle" font-family="${FONT}">지원</text>
  <text x="${20 + (W - 40) * 5 / 6}" y="440" font-size="15" font-weight="800" fill="${C.ink}" text-anchor="middle" font-family="${FONT}">3명</text>
  <text x="20" y="494" font-size="14" fill="${C.ink2}" font-family="${FONT}">이사 가면서 정리해요. 상판에 옅은 생활기스</text>
  <text x="20" y="514" font-size="14" fill="${C.ink2}" font-family="${FONT}">있고 다리 흔들림 없습니다.</text>
  <text x="20" y="556" font-size="15" font-weight="800" fill="${C.ink}" font-family="${FONT}">이 거래가 안전한 이유</text>
  ${safetySteps
    .map(
      ([n, t, d], i) => `
    <circle cx="31" cy="${590 + i * 52}" r="11" fill="${C.lineSoft}"/>
    <text x="31" y="${594 + i * 52}" font-size="10.5" font-weight="700" fill="${C.sub}" text-anchor="middle" font-family="${FONT}">${n}</text>
    <text x="52" y="${594 + i * 52}" font-size="13" font-weight="700" fill="${C.ink}" font-family="${FONT}">${esc(t)}</text>
    <text x="52" y="${610 + i * 52}" font-size="11.5" fill="${C.sub}" font-family="${FONT}">${esc(d.slice(0, 26))}</text>
  `,
    )
    .join("")}
  <rect x="0" y="${H - 84}" width="${W}" height="84" fill="#FFFFFF" stroke="${C.lineSoft}"/>
  <text x="20" y="${H - 44}" font-size="20" font-weight="800" fill="${C.ink}" font-family="${FONT}">3,000원</text>
  <text x="20" y="${H - 26}" font-size="11" fill="${C.sub2}" font-family="${FONT}">현재 최고 제시가</text>
  <rect x="150" y="${H - 66}" width="${W - 170}" height="50" rx="16" fill="${C.brand}"/>
  <text x="${150 + (W - 170) / 2}" y="${H - 36}" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="${FONT}">지원서 쓰기 (30초)</text>
`);

// ---------- 3) 지원서 작성 ----------
const screen3 = frame(`
  <rect width="${W}" height="${H}" fill="#FFFFFF"/>
  ${statusBar()}
  <text x="28" y="88" font-size="20" fill="${C.ink}" font-family="${FONT}">←</text>
  <text x="58" y="88" font-size="17" font-weight="800" fill="${C.ink}" font-family="${FONT}">지원서 쓰기</text>
  <text x="20" y="128" font-size="13" font-weight="700" fill="${C.sub}" font-family="${FONT}">제시 금액</text>
  <rect x="20" y="140" width="${W - 40}" height="100" rx="16" fill="#FFFFFF" stroke="${C.line}"/>
  <text x="${W / 2}" y="164" font-size="12" fill="${C.sub2}" text-anchor="middle" font-family="${FONT}">현재 최고 3,000원 · 시작가 그대로도 지원할 수 있어요</text>
  <circle cx="115" cy="200" r="22" fill="none" stroke="${C.line}"/>
  <text x="115" y="207" font-size="20" fill="${C.ink2}" text-anchor="middle" font-family="${FONT}">−</text>
  <text x="${W / 2}" y="210" font-size="28" font-weight="800" fill="${C.ink}" text-anchor="middle" font-family="${FONT}">3,000원</text>
  <circle cx="${W - 115}" cy="200" r="22" fill="none" stroke="${C.line}"/>
  <text x="${W - 115}" y="207" font-size="20" fill="${C.ink2}" text-anchor="middle" font-family="${FONT}">＋</text>
  <text x="20" y="270" font-size="13" font-weight="700" fill="${C.sub}" font-family="${FONT}">방문 가능 시간</text>
  <rect x="20" y="280" width="168" height="38" rx="19" fill="${C.brandTint}" stroke="${C.brand}"/>
  <text x="104" y="304" font-size="13" font-weight="700" fill="${C.brand}" text-anchor="middle" font-family="${FONT}">오늘 저녁 7시 이후</text>
  <rect x="196" y="280" width="150" height="38" rx="19" fill="#FFFFFF" stroke="${C.line}"/>
  <text x="271" y="304" font-size="13" fill="${C.ink2}" text-anchor="middle" font-family="${FONT}">내일 오전 10~12시</text>
  <text x="20" y="352" font-size="13" font-weight="700" fill="${C.sub}" font-family="${FONT}">한 줄 메시지 (선택)</text>
  <rect x="20" y="362" width="${W - 40}" height="48" rx="12" fill="#FFFFFF" stroke="${C.line}"/>
  <text x="34" y="391" font-size="13.5" fill="${C.sub2}" font-family="${FONT}">예) 바로 앞 살아서 5분이면 가요</text>
  <rect x="20" y="428" width="${W - 40}" height="64" rx="12" fill="#F9FAFB"/>
  <text x="34" y="452" font-size="12" fill="${C.sub}" font-family="${FONT}">지원서 제출은 무료예요. 판매자가 수락하는</text>
  <text x="34" y="470" font-size="12" fill="${C.sub}" font-family="${FONT}">순간에만 카드에서 결제되고, 낙찰 후에는</text>
  <text x="34" y="488" font-size="12" fill="${C.sub}" font-family="${FONT}">취소할 수 없어요.</text>
  <rect x="0" y="${H - 84}" width="${W}" height="84" fill="#FFFFFF" stroke="${C.lineSoft}"/>
  <rect x="20" y="${H - 66}" width="${W - 40}" height="50" rx="16" fill="${C.brand}"/>
  <text x="${W / 2}" y="${H - 36}" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="${FONT}">지원서 내기</text>
`);

// ---------- 4) 땅땅 확정 ----------
const screen4 = frame(`
  <rect width="${W}" height="${H}" fill="${C.ink}" opacity="0.5"/>
  <rect x="0" y="${H - 420}" width="${W}" height="420" rx="22" fill="#FFFFFF"/>
  <rect x="${W / 2 - 18}" y="${H - 396}" width="36" height="4" rx="2" fill="${C.line}"/>
  <text x="${W / 2}" y="${H - 340}" font-size="18" font-weight="800" fill="${C.ink}" text-anchor="middle" font-family="${FONT}">이 지원서를 수락할까요?</text>
  <g transform="translate(${W / 2 - 115}, ${H - 300}) rotate(-2)">
    <rect x="0" y="10" width="230" height="92" rx="18" fill="${C.brand}"/>
    <line x1="18" y1="24" x2="18" y2="88" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="3,3"/>
    <circle cx="18" cy="10" r="5" fill="${C.surfaceWarm}"/>
    <circle cx="18" cy="102" r="5" fill="${C.surfaceWarm}"/>
    <text x="42" y="40" font-size="11" font-weight="700" fill="#FFFFFF" opacity="0.75" font-family="${FONT}">낙찰 티켓</text>
    <text x="42" y="70" font-size="26" font-weight="800" fill="#FFFFFF" font-family="${FONT}">3,000원</text>
    <text x="42" y="88" font-size="11.5" fill="#FFFFFF" opacity="0.85" font-family="${FONT}">성수동감자 님 · 결제 완료</text>
    <circle cx="204" cy="6" r="42" fill="#FFFFFF" opacity="0.92" stroke="${C.stamp}" stroke-width="4"/>
    <text x="204" y="13" font-size="15" font-weight="900" fill="${C.stamp}" text-anchor="middle" font-family="${FONT}">땅땅</text>
  </g>
  <text x="${W / 2}" y="${H - 168}" font-size="13" fill="${C.ink2}" text-anchor="middle" font-family="${FONT}">결제가 완료됐어요. 낙찰자와 채팅으로</text>
  <text x="${W / 2}" y="${H - 148}" font-size="13" fill="${C.ink2}" text-anchor="middle" font-family="${FONT}">수령 시간을 확정해주세요.</text>
  <rect x="20" y="${H - 118}" width="${W - 40}" height="50" rx="16" fill="${C.point}"/>
  <text x="${W / 2}" y="${H - 88}" font-size="15" font-weight="800" fill="#FFFFFF" text-anchor="middle" font-family="${FONT}">채팅하기</text>
`);

// ---------- 5) 거래 탭 ----------
const screen5 = frame(`
  <rect width="${W}" height="${H}" fill="${C.surfaceWarm}"/>
  ${statusBar()}
  <text x="20" y="88" font-size="19" font-weight="800" fill="${C.ink}" font-family="${FONT}">거래</text>
  <text x="${W - 52}" y="86" font-size="13" font-weight="700" fill="${C.sub}" font-family="${FONT}">설정</text>
  <text x="20" y="122" font-size="13" font-weight="700" fill="${C.sub2}" font-family="${FONT}">내 매물</text>
  <rect x="20" y="132" width="${W - 40}" height="110" rx="16" fill="#FFFFFF" stroke="${C.line}"/>
  <text x="36" y="160" font-size="15" font-weight="700" fill="${C.ink}" font-family="${FONT}">원목 사이드 테이블</text>
  ${chip(W - 106, 148, "지원 3건", "live")}
  <text x="36" y="184" font-size="13" fill="${C.sub}" font-family="${FONT}">현재 최고 제시가 3,000원</text>
  <rect x="36" y="198" width="${W - 72}" height="34" rx="10" fill="${C.brandTint}"/>
  <text x="${W / 2}" y="220" font-size="13" font-weight="700" fill="${C.brand}" text-anchor="middle" font-family="${FONT}">지원서 보고 낙찰자 고르기</text>
  <text x="20" y="278" font-size="13" font-weight="700" fill="${C.sub2}" font-family="${FONT}">내 지원</text>
  <rect x="20" y="288" width="${W - 40}" height="112" rx="16" fill="#FFFFFF" stroke="${C.line}"/>
  <text x="36" y="316" font-size="15" font-weight="700" fill="${C.ink}" font-family="${FONT}">3구 인덕션 프라이팬 세트</text>
  ${chip(W - 90, 304, "낙찰", "green")}
  <text x="36" y="340" font-size="13" fill="${C.sub}" font-family="${FONT}">내 제시가 · 주말 오전</text>
  <text x="${W - 36}" y="340" font-size="15" font-weight="700" fill="${C.ink}" text-anchor="end" font-family="${FONT}">5,000원</text>
  <rect x="36" y="356" width="${W - 72}" height="34" rx="10" fill="${C.brandTint}"/>
  <text x="${W / 2}" y="378" font-size="13" font-weight="700" fill="${C.brand}" text-anchor="middle" font-family="${FONT}">채팅하기</text>
`);

async function write(name, svg) {
  const dir = "docs/store-assets/mockup-screenshots";
  mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(`${dir}/${name}`);
  console.log(`wrote ${dir}/${name}`);
}

async function main() {
  await write("1-home-feed.png", screen1);
  await write("2-item-detail.png", screen2);
  await write("3-apply.png", screen3);
  await write("4-award-stamp.png", screen4);
  await write("5-trades.png", screen5);
}

main();
