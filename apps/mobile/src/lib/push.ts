import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// 4단계 — 푸시 토큰 등록. 실제 발송은 DB 쪽(pg_cron + pg_net,
// supabase/migrations/20260929000500_notifications.sql)이 전담한다 — 여기서는 토큰을 받아
// push_tokens에 저장하는 것까지만 한다.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// 시뮬레이터/에뮬레이터·웹 등 푸시를 지원하지 않는 환경에서는 getExpoPushTokenAsync 자체가
// 실패한다 — expo-device를 추가로 들이지 않고 그냥 실패를 흡수한다(로그인 자체를 막으면 안 되므로
// 호출부에서도 항상 .catch로 감싼다).
export async function registerForPushNotifications(userId: string): Promise<void> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.DEFAULT,
      lightColor: "#4059C8",
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);

  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      { profile_id: userId, expo_push_token: tokenResponse.data, updated_at: new Date().toISOString() },
      { onConflict: "profile_id" },
    );
  if (error) throw error;
}
