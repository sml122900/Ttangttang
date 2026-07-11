# PAR 소재 — 2026-07-12 (Phase 3: 지원과 돈)

각 항목: Problem(문제) / Action(행동) / Result(결과) 순. 이력서 한 줄은 각 문서에도 있음.

## 1. 결제 게이트웨이 추상화
- **P**: 토스페이먼츠 지급대행 심사 결과에 따라 PG/정산 방식이 바뀔 수 있는 리스크가
  사전에 문서화돼 있었음(PROJECT.md §4).
- **A**: `PaymentGateway` 인터페이스(`issueBillingKey`/`chargeBilling`)를 분리하고 토스 구현체를
  그 뒤에 숨김. API 라우트는 인터페이스만 참조.
- **R**: PG 교체가 파일 하나 추가 + export 한 줄 수정으로 축소되는 구조를 확보.
- 상세: [[payment-gateway-abstraction]]

## 2. 결제 자격증명이 클라이언트에 닿지 않는 서버 중개형 웹뷰
- **P**: 토스 빌링키 발급에는 시크릿 키가 필요한데, 모바일 클라이언트에는 절대 둘 수 없음.
- **A**: 카드등록 콜백을 모바일이 아니라 `apps/web`(서버)이 받아 시크릿 키로 빌링키를
  발급·저장하고, 클라이언트에는 성공/실패 여부만 돌려주는 아키텍처로 설계.
- **R**: 빌링키 원문이 어떤 시점에도 클라이언트 메모리/네트워크 응답에 등장하지 않음.
- 상세: [[billing-key-server-mediated-webview]]

## 3. VPN 낀 로컬 네트워크에서 실기기 테스트 안정화
- **P**: 토스 콜백의 https 요구사항 + PC의 애매한 네트워크 구성(VPN 어댑터만 잡힘)으로 LAN
  기반 실기기 테스트가 막힘.
- **A**: 백엔드는 클라우드 Supabase로, 웹은 ngrok, 모바일 번들러는 `expo start --tunnel`로
  전부 터널 기반으로 전환.
- **R**: 네트워크 토폴로지에 의존하지 않는 재현 가능한 실기기 테스트 루프 확보.
- 상세: [[dev-environment-cloud-and-tunnels]]

## 4. pnpm 모노레포 + Expo 터널 도구 해석 문제 디버깅
- **P**: `@expo/ngrok`을 전역 설치해도 Expo CLI가 계속 못 찾는 원인 불명 실패.
- **A**: pnpm의 엄격한 node_modules 격리가 원인임을 추론하고, 전역 설치 대신 워크스페이스
  devDependency로 전환.
- **R**: 근본 원인(패키지 매니저 격리 모델)을 짚어내 재발 가능한 클래스의 문제를 해결.
- 상세: [[pnpm-monorepo-expo-tunnel-ngrok-resolution]]

## 5. Expo Go 동적 딥링크를 고려한 콜백 설계
- **P**: 고정 앱 스킴을 가정하고 짰다면 Expo Go에서 카드등록 완료 후 앱 복귀가 아예 안 될
  뻔했음.
- **A**: OAuth의 redirect_uri 왕복 패턴을 차용해, 클라이언트가 자기 콜백 주소를 요청에 실어
  보내고 서버 체인 전체(토스 successUrl → 콜백 라우트 → 완료 페이지)가 그대로 들고 다니게
  설계.
- **R**: 실제 장애가 나기 전에 설계 단계에서 예방 — 이전 Phase의 카카오 로그인 트러블슈팅
  경험을 새 기능에 선제적으로 적용.
- 상세: [[expo-go-dynamic-redirect-vs-fixed-scheme]]
