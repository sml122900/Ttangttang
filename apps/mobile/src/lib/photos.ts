import * as ImagePicker from "expo-image-picker";
import { supabase } from "./supabase";

// 4단계 — 매물 사진 실업로드 (Supabase Storage, 공개 버킷 item-photos).
// post.tsx와 item/[id]/edit.tsx가 공유한다.

export async function pickPhoto(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("사진 접근 권한이 필요해요");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.7,
    allowsEditing: true,
    aspect: [4, 3],
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}

// 업로드 경로를 항상 <내 uid>/... 로 시작하게 한다 — item_photos_insert_own RLS(§ 스토리지
// 정책)가 그 접두사로만 쓰기를 허용한다.
export async function uploadItemPhoto(userId: string, localUri: string): Promise<string> {
  const response = await fetch(localUri);
  const blob = await response.blob();
  const ext = (localUri.split(".").pop() || "jpg").toLowerCase().split("?")[0];
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from("item-photos").upload(path, blob, {
    contentType: blob.type || `image/${ext}`,
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("item-photos").getPublicUrl(path);
  return data.publicUrl;
}
