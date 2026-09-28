// 4단계 — 사진 업로드 후 apps/web에 등록 초안(제목·설명·시작가)을 요청한다.
// 네트워크 실패 등 진짜 오류는 예외로 던진다 — 호출부(post.tsx)가 "그냥 수동 입력 계속"으로
// 처리한다(조용한 폴백, 별도 에러 화면 없음). 반면 "이 사진은 물건이 아니다"는 오류가 아니라
// 정상 응답의 한 형태라 isItem:false로 정상 반환한다 — apps/web/lib/ai-assist.ts의 is_item
// 필드를 그대로 옮긴 것. 예전에는 이 경우도 title/description에 거절 문구가 그대로 채워져,
// 사용자가 그대로 등록하면 그 문장이 매물 제목이 되는 문제가 있었다(2026-09-30 발견·수정).
export type ListingSuggestion =
  | { isItem: true; title: string; description: string; startPrice: 1000 | 3000 | 5000 }
  | { isItem: false; rejectReason: string };

export async function requestListingSuggestion(accessToken: string, imageUrl: string): Promise<ListingSuggestion> {
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) {
    throw new Error("EXPO_PUBLIC_WEB_ORIGIN is not set (.env, see .env.example)");
  }
  const res = await fetch(`${webOrigin}/api/items/ai-assist`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ imageUrl }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    isItem?: boolean;
    title?: string;
    description?: string;
    startPrice?: 1000 | 3000 | 5000;
    rejectReason?: string;
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error ?? "제안을 받지 못했어요");
  }
  if (json.isItem === false) {
    return { isItem: false, rejectReason: json.rejectReason ?? "이 사진에서는 물건을 확인하지 못했어요" };
  }
  if (json.isItem !== true || !json.title || !json.description || !json.startPrice) {
    throw new Error(json.error ?? "제안 형식이 올바르지 않아요");
  }
  return { isItem: true, title: json.title, description: json.description, startPrice: json.startPrice };
}
