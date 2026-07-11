// 브랜드 언어 — PROJECT.md §5 "전 화면 통일". 문구를 화면마다 새로 짓지 말고 여기서 가져다 쓸 것.
export const BRAND_COPY = {
  acceptButton: "땅땅 치고 낙찰 확정",
  awardPush: "땅땅! 낙찰됐어요",
  sellerGuide: "마음에 드는 지원서에 땅땅 치세요",
  rejectedNotice: "이번엔 다른 이웃에게 낙찰됐어요", // 탈락엔 위트 금지, 담백하게
  applyCta: "지원서 쓰기 (30초)",
  guaranteeName: "노쇼 보장",
} as const;

// 시작가 3택 세그먼트에 붙는 한 줄 설명 (ttangttang-prototype.html 등록 화면 참고)
export const START_PRICE_DESCRIPTIONS: Record<1000 | 3000 | 5000, string> = {
  1000: "부담 없이 빨리",
  3000: "쓸 만한 물건",
  5000: "상태 좋은 물건",
};
