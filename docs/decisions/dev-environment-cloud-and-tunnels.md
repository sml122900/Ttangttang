# 로컬 Docker 대신 클라우드 Supabase + 터널 기반 실기기 테스트

> **일부 대체됨 (2026-09-28)**: `apps/web`은 이제 Vercel에 배포돼 있다
> (https://ttangttang-web.vercel.app, `docs/decisions/environment-separation.md`) — 아래 "대가"로
> 적은 ngrok 세션마다 URL이 바뀌는 문제는 `apps/web`에는 더 이상 해당하지 않는다. Expo
> 번들러(Metro)용 `expo start --tunnel`은 그대로 유효하다(별개의 터널). Supabase를 클라우드
> 프로젝트로 쓰는 이유(LAN/VPN 불안정)는 지금도 유효하다.

## Problem
Phase 3부터는 결제(토스 빌링) 콜백을 실제 외부 서비스(토스)가 우리 서버로 리다이렉트해야
하는데, 로컬 `supabase start`(Docker) + LAN IP 조합은 두 가지 문제에 부딪혔다.
1. 토스의 successUrl/failUrl은 사실상 https를 요구해서, `http://<LAN-IP>:3000` 같은 평문 LAN
   주소로는 카드등록 콜백을 안정적으로 받을 수 없다.
2. 개발 PC의 네트워크 구성이 애매했다 — NordVPN 가상 어댑터(10.5.0.2)와 이름이 "이더넷"인
   어댑터(14.52.86.251)만 보이고, 폰이 실제로 붙을 수 있는 평범한 사설 Wi-Fi 대역이 안 잡혀서
   Expo 번들러도 LAN 모드로는 신뢰성 있게 뜨지 않았다.

## Action
- Supabase는 로컬 Docker 대신 클라우드 프로젝트로 링크해 `db push`, 이후 모든 개발을 클라우드
  기준으로 진행 (Kakao OAuth 콜백 URL 문제와도 무관해짐).
- `apps/web`은 `next dev` + `ngrok http 3000`으로 https 터널을 확보해 토스 콜백 URL로 사용.
- Expo는 LAN IP 감지를 아예 포기하고 `expo start --tunnel`(내부적으로 `@expo/ngrok`)로 전환 —
  어느 네트워크에 있든 QR/URL 하나로 붙게 함.

## Result
- 실기기 테스트가 "이 PC의 정확한 LAN IP가 무엇인가"라는, VPN이 낀 환경에서 계속 흔들리는
  질문에서 완전히 자유로워짐.
- 대가: ngrok 무료 플랜 URL은 세션마다 바뀌므로 `apps/mobile/.env`의
  `EXPO_PUBLIC_WEB_ORIGIN`을 매 세션 갱신해야 함 — 지금은 로컬 개발 단계라 감내할 만한
  비용으로 판단.
- **이력서 소재**: "VPN이 낀 로컬 네트워크 환경에서 LAN 기반 실기기 테스트가 불안정함을
  파악하고, 클라우드 백엔드 + 터널링 기반 개발 환경으로 전환해 재현 가능한 테스트 루프를
  확보함."
