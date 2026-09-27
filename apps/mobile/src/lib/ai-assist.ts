// 4단계 — 사진 업로드 후 apps/web에 등록 초안(제목·설명·시작가)을 요청한다.
// 실패해도 예외만 던진다 — 호출부(post.tsx)가 실패를 "그냥 수동 입력 계속"으로 처리한다
// (사용자에게는 조용한 폴백, 별도 에러 화면 없음).

export interface ListingSuggestion {
  title: string;
  description: string;
  startPrice: 1000 | 3000 | 5000;
}

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
  const json = (await res.json().catch(() => ({}))) as Partial<ListingSuggestion> & { error?: string };
  if (!res.ok || !json.title || !json.description || !json.startPrice) {
    throw new Error(json.error ?? "제안을 받지 못했어요");
  }
  return { title: json.title, description: json.description, startPrice: json.startPrice };
}
