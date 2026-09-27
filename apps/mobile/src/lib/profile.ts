import { supabase } from "./supabase";

// handle_new_user() 트리거(supabase/migrations/20260703111644_handle_new_user.sql)가 신규 가입
// 시 넣는 값 그대로 — "아직 온보딩을 마치지 않았다"는 신호로 재사용한다. 온보딩 완료 시
// 이 값으로 덮어쓰지 않기만 하면 되므로 별도 boolean 컬럼을 추가하지 않았다.
const NEIGHBORHOOD_PLACEHOLDER = "동네 미설정";

export interface MyProfile {
  nickname: string;
  neighborhood: string;
}

export async function fetchMyProfile(userId: string): Promise<MyProfile> {
  const { data, error } = await supabase
    .from("profiles")
    .select("nickname,neighborhood")
    .eq("id", userId)
    .single<MyProfile>();
  if (error) throw error;
  return data;
}

export async function needsOnboarding(userId: string): Promise<boolean> {
  const profile = await fetchMyProfile(userId);
  return profile.neighborhood === NEIGHBORHOOD_PLACEHOLDER;
}

export async function completeOnboarding(userId: string, nickname: string, neighborhood: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ nickname, neighborhood })
    .eq("id", userId);
  if (error) throw error;
}
