import { NextRequest, NextResponse } from "next/server";
import { suggestListingFromImage } from "@/lib/ai-assist";
import { createServiceRoleClient } from "@/lib/supabase-admin";

export const maxDuration = 30;

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function expectedImagePrefix(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set");
  return `${supabaseUrl}/storage/v1/object/public/item-photos/`;
}

// 4단계 — 사진 1장으로 제목·설명·시작가 제안. 인증을 요구하는 이유는 비용 통제뿐이다
// (Claude API 호출은 apps/web 서버에서만 — 키가 클라이언트에 노출되지 않는다).
// imageUrl은 반드시 우리 Storage 버킷(item-photos, 공개) 소속이어야 한다 — 임의 URL을
// 그대로 fetch하면 SSRF 통로가 된다.
export async function POST(request: NextRequest) {
  const admin = createServiceRoleClient();
  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }
  const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { imageUrl?: unknown };
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  let prefix: string;
  try {
    prefix = expectedImagePrefix();
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (!imageUrl.startsWith(prefix)) {
    return NextResponse.json({ error: "허용되지 않은 이미지 URL이에요" }, { status: 400 });
  }

  let imageRes: Response;
  try {
    imageRes = await fetch(imageUrl);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "이미지를 가져오지 못했어요" },
      { status: 502 },
    );
  }
  if (!imageRes.ok) {
    return NextResponse.json({ error: `이미지를 가져오지 못했어요 (HTTP ${imageRes.status})` }, { status: 502 });
  }
  const contentType = imageRes.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json({ error: "이미지 파일이 아니에요" }, { status: 400 });
  }

  const buffer = Buffer.from(await imageRes.arrayBuffer());
  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "이미지가 너무 커요" }, { status: 413 });
  }

  try {
    const suggestion = await suggestListingFromImage(buffer.toString("base64"), contentType);
    return NextResponse.json(suggestion);
  } catch (err) {
    // 실패는 502로 알리기만 한다 — 모바일은 이 경우 수동 입력으로 자연스럽게 폴백한다.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "제안을 만들지 못했어요" },
      { status: 502 },
    );
  }
}
