import { Alert, Linking } from "react-native";

// 로그인 화면과 설정 화면에서 공용으로 쓴다 — apps/web에 배포된 페이지를 그대로 연다
// (모바일에 약관/처리방침 내용을 중복 유지하지 않는다).
export function openLegalPage(path: "/terms" | "/privacy") {
  const webOrigin = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  if (!webOrigin) {
    Alert.alert("페이지를 열 수 없어요", "EXPO_PUBLIC_WEB_ORIGIN이 설정되지 않았어요.");
    return;
  }
  Linking.openURL(`${webOrigin}${path}`).catch(() => {
    Alert.alert("페이지를 여는 데 실패했어요");
  });
}
