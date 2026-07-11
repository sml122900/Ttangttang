# Expo Go의 동적 딥링크 스킴이 고정 스킴을 가정한 웹 콜백을 깰 뻔한 문제

## 문제상황
카드등록 웹뷰(`apps/web`)가 완료 후 앱으로 되돌아갈 때 쓸 딥링크를, 처음에는 앱의 고정 스킴
(`ttangttang://`)으로 하드코딩하려 했다. 그런데 이 프로젝트는 이미 이전 Phase(카카오 로그인)에서
"Expo Go는 `Linking.createURL()`이 세션마다 다른 `exp://<주소>:<포트>` 형태를 반환하고,
스탠드얼론/dev-client 빌드에서만 고정 스킴(`ttangttang://`)을 쓴다"는 걸 확인한 적이 있었다.
고정 스킴으로 짜면, `expo-web-browser`의 `openAuthSessionAsync`가 브라우저 복귀를 감지하는
기준(전달한 `redirectTo`와 실제 이동한 URL이 일치하는지)과 어긋나 Expo Go에서는 카드등록
완료 후 앱으로 자동 복귀가 아예 안 될 상황이었다.

## 시도한 것들
1. 고정 스킴(`ttangttang://billing-done`)으로 웹 페이지의 최종 리다이렉트를 만들고 넘어가려다,
   카카오 로그인 때 이미 겪은 "Expo Go 동적 스킴" 이슈가 떠올라 멈춤.
2. 이번엔 Supabase Auth의 redirect allowlist(`additional_redirect_urls`, 정확 일치 요구)와
   달리, `expo-web-browser`의 `openAuthSessionAsync`는 클라이언트가 넘긴 `redirectTo` 값을
   그 자리에서 매칭하는 것이라 사전 등록이 필요 없다는 점을 확인 — 즉 이 경로는 동적 스킴이어도
   원칙적으로 동작 가능하다는 걸 확인.

## 최종 해결법
모바일이 자신의 `Linking.createURL("/")` 값을 `clientRedirect` 쿼리 파라미터로 카드등록 요청에
실어 보내고, 이 값을 토스 successUrl/failUrl → 콜백 라우트 → 최종 완료 페이지까지 그대로
꿰어(threading) 마지막에 그 URL로 리다이렉트하도록 설계. 표준 OAuth의 `redirect_uri` 왕복
패턴과 동일한 방식으로, 앱이 서버에게 "돌아올 곳"을 알려주고 서버가 그대로 지켜서 돌려주는
구조.

## 이력서 소재
"Expo Go의 동적 딥링크 스킴이라는 제약을 사전에 인지하고, OAuth의 redirect_uri 왕복 패턴을
차용해 클라이언트가 자기 콜백 주소를 서버 체인 전체에 실어 보내는 방식으로 설계함 — 실제
버그가 나기 전에 설계 단계에서 차단."
