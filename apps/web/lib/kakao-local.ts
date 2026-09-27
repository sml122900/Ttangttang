// 3단계 — 온보딩 동네 설정(카카오 로컬 API, docs/decisions.md 2026-09-27 사용자 결정: "현위치 기반
// 자동 설정 + 수동 검색 선택"). REST API 키는 서버에만 둔다 — supabase/.env의 카카오 OAuth
// client_id와 같은 값(Kakao Developers 앱의 REST API 키 하나가 로그인과 로컬 API를 겸한다,
// apps/web/.env.example 참고). 모바일 앱은 좌표/검색어만 apps/web에 보내고, 이 파일이 실제
// 카카오 호출과 정규화를 담당한다.

const KAKAO_LOCAL_BASE = "https://dapi.kakao.com/v2/local";

function authHeader(): string {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    throw new Error("KAKAO_REST_API_KEY is not set (server-only env, see apps/web/.env.example)");
  }
  return `KakaoAK ${key}`;
}

interface KakaoRegionDocument {
  region_type: "H" | "B";
  region_2depth_name: string;
  region_3depth_name: string;
}

interface KakaoAddressDocument {
  address_name: string;
  address?: { region_2depth_name?: string; region_3depth_name?: string } | null;
  road_address?: { region_2depth_name?: string; region_3depth_name?: string } | null;
}

function formatNeighborhood(gu: string | undefined, dong: string | undefined): string | null {
  if (!gu || !dong) return null;
  return `${gu} ${dong}`;
}

/** 위경도 → 행정동 이름("성동구 행당동" 형식). 못 찾으면 null. */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `${KAKAO_LOCAL_BASE}/geo/coord2regioncode.json?x=${lng}&y=${lat}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    throw new Error(`카카오 로컬 API 오류: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { documents?: KakaoRegionDocument[] };
  const docs = json.documents ?? [];
  // 행정동(H)을 우선하고, 없으면 법정동(B)으로 폴백한다.
  const region = docs.find((d) => d.region_type === "H") ?? docs.find((d) => d.region_type === "B");
  return region ? formatNeighborhood(region.region_2depth_name, region.region_3depth_name) : null;
}

/** 자유 텍스트 검색어 → 후보 동네 목록(중복 제거, 최대 10개). */
export async function searchNeighborhoods(query: string): Promise<string[]> {
  const url = `${KAKAO_LOCAL_BASE}/search/address.json?query=${encodeURIComponent(query)}&size=15`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  if (!res.ok) {
    throw new Error(`카카오 로컬 API 오류: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { documents?: KakaoAddressDocument[] };
  const docs = json.documents ?? [];

  const results: string[] = [];
  for (const doc of docs) {
    const source = doc.address ?? doc.road_address;
    const neighborhood = formatNeighborhood(source?.region_2depth_name, source?.region_3depth_name);
    if (neighborhood && !results.includes(neighborhood)) results.push(neighborhood);
    if (results.length >= 10) break;
  }
  return results;
}
