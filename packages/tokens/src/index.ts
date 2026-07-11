// 디자인 토큰 — PROJECT.md §5
export const colors = {
  brand: "#4059C8", // 천원권 블루
  brandPress: "#3348A8",
  brandTint: "#EEF1FC",
  point: "#0BA05C", // 낙찰/정산 그린
  pointTint: "#E8F7F0",
  ink: "#191F28",
  ink2: "#333D4B",
  sub: "#6B7684",
  sub2: "#8B95A1",
  line: "#E5E8EB",
  lineSoft: "#F2F4F6",
  surfaceWarm: "#FDFBF7", // 동네 레지스터 배경
  surfaceMoney: "#FFFFFF", // 돈 레지스터 배경
  danger: "#E5503C",
} as const;

export const START_PRICES = [1000, 3000, 5000] as const;
export type StartPrice = (typeof START_PRICES)[number];

export const radius = {
  card: 14,
  sheet: 22,
} as const;

// 2-레지스터 규칙: 화면은 반드시 둘 중 하나에 속한다 — 혼합 금지.
export type Register = "neighborhood" | "money";

export const registers: Record<
  Register,
  { background: string; allowWit: boolean; allowMotion: boolean; tabularNums: boolean }
> = {
  // 피드/상세/지원서 작성/채팅/프로필 — 당근 문법 + 배민식 위트
  neighborhood: {
    background: colors.surfaceWarm,
    allowWit: true,
    allowMotion: false,
    tabularNums: false,
  },
  // 카드 등록/자동결제 동의/수락 확인/정산/거래내역 — 토스 문법, 위트·장식 금지
  money: {
    background: colors.surfaceMoney,
    allowWit: false,
    allowMotion: true, // "땅땅" 더블 노크는 수락 확인 시트(돈 레지스터)에서만 허용되는 유일한 예외
    tabularNums: true,
  },
};
