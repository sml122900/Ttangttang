#!/usr/bin/env node
// 6단계 — 앱 아이콘/스플래시 생성. 브랜드 블루(#4059C8) + 천원권(지폐) 모티브 + 기존
// AwardStamp.tsx의 "땅땅" 더블 노크 스탬프 시각 언어(주황 #FF6B4A 스탬프)를 재사용한다.
// 일회성 생성 스크립트 — 결과물만 apps/mobile/assets/images/에 커밋하고 리포는 남긴다.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BRAND = "#4059C8";
const BRAND_PRESS = "#3348A8";
const STAMP = "#FF6B4A";
const PAPER = "#FDFBF7";
const BORDER = "#C7CEEA";

// 지폐 + 스탬프 마크. safeZone=true면 Android adaptive icon 안전영역(중앙 66%)에 맞게 축소.
function mark({ safeZone = false, monochrome = false } = {}) {
  const s = safeZone ? 0.72 : 1; // 축소 비율
  const cx = 512;
  const cy = 512;
  const noteW = 560 * s;
  const noteH = 330 * s;
  const noteRx = 42 * s;
  const noteCx = cx - 40 * s;
  const noteCy = cy + 30 * s;
  const stampR = 175 * s;
  const stampCx = cx + 190 * s;
  const stampCy = cy - 160 * s;
  // Android는 monochrome 레이어의 실제 RGB는 버리고 알파(모양)만 써서 사용자가 고른 테마색으로
  // 다시 칠한다 — 그래도 미리보기에서 헷갈리지 않게 단색(검정, 불투명)으로만 그린다.
  const MONO = "#000000";
  const noteFill = monochrome ? MONO : PAPER;
  const noteStroke = monochrome ? MONO : BORDER;
  const stampFill = monochrome ? MONO : STAMP;
  const stampStroke = monochrome ? "none" : "#FFFFFF";
  const textFill = monochrome ? "#FFFFFF" : "#FFFFFF"; // 스탬프 원 안쪽은 항상 반대색으로 뚫어 글자가 보이게 한다(모노크롬도 마스크 상 구멍으로 처리됨)

  return `
    <g transform="rotate(-8 ${noteCx} ${noteCy})">
      <rect x="${noteCx - noteW / 2}" y="${noteCy - noteH / 2}" width="${noteW}" height="${noteH}"
            rx="${noteRx}" fill="${noteFill}" stroke="${noteStroke}" stroke-width="${10 * s}" ${monochrome ? 'fill-opacity="0.92"' : ""} />
      <circle cx="${noteCx - noteW / 2 + 70 * s}" cy="${noteCy}" r="${46 * s}" fill="none" stroke="${monochrome ? MONO : BORDER}" stroke-width="${7 * s}" opacity="0.9" />
      <circle cx="${noteCx + noteW / 2 - 70 * s}" cy="${noteCy}" r="${46 * s}" fill="none" stroke="${monochrome ? MONO : BORDER}" stroke-width="${7 * s}" opacity="0.9" />
    </g>
    <circle cx="${stampCx}" cy="${stampCy}" r="${stampR}" fill="${stampFill}" ${stampStroke !== "none" ? `stroke="${stampStroke}" stroke-width="${20 * s}"` : ""} />
    <text x="${stampCx}" y="${stampCy + stampR * 0.34}" font-size="${stampR * 1.15}" font-weight="900"
          fill="${textFill}" text-anchor="middle" font-family="Malgun Gothic, sans-serif">땅</text>
  `;
}

function svgDoc(inner, size = 1024) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${inner}</svg>`;
}

async function write(name, svg, size) {
  const dir = "apps/mobile/assets/images";
  mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${dir}/${name}`);
  console.log(`wrote ${dir}/${name} (${size}x${size})`);
}

async function main() {
  // 1) icon.png — 배경 포함, 범용(Expo Go 등 어댑티브 마스킹이 없는 컨텍스트)
  await write(
    "icon.png",
    svgDoc(`<rect width="1024" height="1024" fill="${BRAND}"/>${mark({ safeZone: true })}`),
    1024,
  );

  // 2) Android adaptive icon — 전경(투명, 안전영역 축소) / 배경(단색) / 단색(테마 아이콘용)
  await write("android-icon-foreground.png", svgDoc(mark({ safeZone: true })), 1024);
  await write("android-icon-background.png", svgDoc(`<rect width="1024" height="1024" fill="${BRAND}"/>`), 1024);
  await write(
    "android-icon-monochrome.png",
    svgDoc(mark({ safeZone: true, monochrome: true })),
    1024,
  );

  // 3) 스플래시 — expo-splash-screen이 배경색(#4059C8, app.json에 이미 설정)을 따로 깔고
  //    이 이미지를 작게(imageWidth:76) 얹는다 — 투명 배경, 마크만.
  await write("splash-icon.png", svgDoc(mark({ safeZone: true })), 600);

  // 4) 파비콘 — 작은 크기라 안전영역 없이 꽉 채운다.
  await write(
    "favicon.png",
    svgDoc(`<rect width="1024" height="1024" fill="${BRAND}"/>${mark({ safeZone: false })}`),
    128,
  );

  console.log("\n참고용 브랜드 색상:", { BRAND, BRAND_PRESS, STAMP, PAPER, BORDER });
}

main();
