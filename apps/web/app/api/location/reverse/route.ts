import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/lib/kakao-local";

// 온보딩 3단계 "현재 위치로 자동 설정" — 모바일이 expo-location으로 얻은 좌표를 보내면
// 행정동 이름으로 바꿔 돌려준다. 인증 불필요(위치 자체가 민감정보지만 여기서 저장하지 않고
// 그대로 흘려보낼 뿐이다 — 실제 저장은 모바일이 profiles.neighborhood를 본인 세션으로 갱신할 때).
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng이 올바르지 않아요" }, { status: 400 });
  }

  try {
    const neighborhood = await reverseGeocode(lat, lng);
    if (!neighborhood) {
      return NextResponse.json({ error: "이 위치의 동네를 찾지 못했어요" }, { status: 404 });
    }
    return NextResponse.json({ neighborhood });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
