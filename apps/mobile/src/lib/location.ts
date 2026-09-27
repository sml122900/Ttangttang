import * as Location from "expo-location";

// 3단계 온보딩 — "현재 위치로 자동 설정 + 수동 검색" (docs/decisions.md 2026-09-27 사용자 결정).
// 카카오 REST API 키는 서버 전용(apps/web/lib/kakao-local.ts)이라 여기서는 좌표/검색어만
// apps/web에 넘기고 결과 문자열만 받는다.

function webOrigin(): string {
  const origin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!origin) throw new Error("EXPO_PUBLIC_WEB_ORIGIN is not set (.env, see .env.example)");
  return origin;
}

export type CurrentNeighborhoodResult =
  | { ok: true; neighborhood: string }
  | { ok: false; reason: "permission_denied" | "unavailable" | "not_found" | "network_error"; message: string };

// 위치 권한 요청 → GPS 좌표 → apps/web에서 행정동 이름으로 변환.
export async function fetchCurrentNeighborhood(): Promise<CurrentNeighborhoodResult> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") {
    return { ok: false, reason: "permission_denied", message: "위치 권한이 필요해요. 직접 검색해주세요." };
  }

  let coords: { latitude: number; longitude: number };
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    coords = position.coords;
  } catch (err) {
    return {
      ok: false,
      reason: "unavailable",
      message: err instanceof Error ? err.message : "위치를 가져오지 못했어요",
    };
  }

  try {
    const res = await fetch(
      `${webOrigin()}/api/location/reverse?lat=${coords.latitude}&lng=${coords.longitude}`,
    );
    const json = (await res.json().catch(() => ({}))) as { neighborhood?: string; error?: string };
    if (!res.ok || !json.neighborhood) {
      return { ok: false, reason: "not_found", message: json.error ?? "이 위치의 동네를 찾지 못했어요" };
    }
    return { ok: true, neighborhood: json.neighborhood };
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      message: err instanceof Error ? err.message : "네트워크 오류가 발생했어요",
    };
  }
}

export async function searchNeighborhoods(query: string): Promise<string[]> {
  const res = await fetch(`${webOrigin()}/api/location/search?query=${encodeURIComponent(query)}`);
  const json = (await res.json().catch(() => ({}))) as { results?: string[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "검색에 실패했어요");
  return json.results ?? [];
}
