import { NextRequest, NextResponse } from "next/server";
import { searchNeighborhoods } from "@/lib/kakao-local";

// 온보딩 3단계 "수동 검색" 폴백 — 위치 권한을 안 주거나 GPS가 틀렸을 때 동네를 직접 찾는다.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json({ error: "두 글자 이상 입력해주세요" }, { status: 400 });
  }

  try {
    const results = await searchNeighborhoods(query);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
