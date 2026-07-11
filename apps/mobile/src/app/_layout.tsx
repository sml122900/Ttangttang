import "../global.css";

import { Stack } from "expo-router";
import { AuthProvider } from "@/lib/auth";

// 게스트도 피드/상세는 볼 수 있다 — 로그인은 등록(Phase 2)·지원(Phase 3) 같은
// "내 이름으로 하는 행동"에서만 요구한다 (프로토타입도 로그인 화면 없이 바로 피드를 보여준다).
export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: "modal" }} />
      </Stack>
    </AuthProvider>
  );
}
