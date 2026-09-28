#!/usr/bin/env node
// 6단계 — 플레이스토어 피처 그래픽(1024x500). scripts/gen-icons.mjs와 같은 마크·색상을 쓴다.
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BRAND = "#4059C8";
const STAMP = "#FF6B4A";
const PAPER = "#FDFBF7";
const BORDER = "#C7CEEA";

const W = 1024;
const H = 500;

// gen-icons.mjs의 마크를 1024x1024 좌표계 그대로 재사용하되, 그래픽 왼쪽에 배치한다.
function mark() {
  const noteW = 340, noteH = 200, noteRx = 26;
  const noteCx = 175, noteCy = 300;
  const stampR = 105, stampCx = 300, stampCy = 175;
  return `
    <g transform="rotate(-8 ${noteCx} ${noteCy})">
      <rect x="${noteCx - noteW / 2}" y="${noteCy - noteH / 2}" width="${noteW}" height="${noteH}"
            rx="${noteRx}" fill="${PAPER}" stroke="${BORDER}" stroke-width="6" />
      <circle cx="${noteCx - noteW / 2 + 42}" cy="${noteCy}" r="28" fill="none" stroke="${BORDER}" stroke-width="4" opacity="0.9" />
      <circle cx="${noteCx + noteW / 2 - 42}" cy="${noteCy}" r="28" fill="none" stroke="${BORDER}" stroke-width="4" opacity="0.9" />
    </g>
    <circle cx="${stampCx}" cy="${stampCy}" r="${stampR}" fill="${STAMP}" stroke="#FFFFFF" stroke-width="12" />
    <text x="${stampCx}" y="${stampCy + stampR * 0.34}" font-size="${stampR * 1.15}" font-weight="900"
          fill="#FFFFFF" text-anchor="middle" font-family="Malgun Gothic, sans-serif">땅</text>
  `;
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BRAND}"/>
  ${mark()}
  <text x="440" y="220" font-size="92" font-weight="800" fill="#FFFFFF" font-family="Malgun Gothic, sans-serif">땅땅</text>
  <text x="442" y="280" font-size="30" font-weight="600" fill="#FFFFFF" opacity="0.92" font-family="Malgun Gothic, sans-serif">입찰은 지원서로, 확정은 땅땅</text>
  <text x="442" y="330" font-size="22" font-weight="500" fill="#FFFFFF" opacity="0.78" font-family="Malgun Gothic, sans-serif">하이퍼로컬 중고나눔 · 소액거래</text>
</svg>`;

async function main() {
  const dir = "docs/store-assets";
  mkdirSync(dir, { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(`${dir}/feature-graphic.png`);
  console.log(`wrote ${dir}/feature-graphic.png (${W}x${H})`);
}

main();
