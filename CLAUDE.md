# CLAUDE.md

이 저장소에서 작업할 때 참고할 것.

## 스펙의 출처
제품/아키텍처 스펙은 **PROJECT.md**가 단일 진실 공급원(source of truth)이다. §0 핵심 규칙은
변경 전 반드시 되물을 것. 코드 구현이 PROJECT.md와 어긋나면 PROJECT.md를 먼저 갱신하고
구현한다.

## 환경
- `apps/mobile` (Expo) / `apps/web` (Next.js) / `packages/shared`, `packages/tokens` /
  `supabase` — pnpm workspace 모노레포.
- Supabase는 **클라우드 프로젝트**(`bacwpzlenygqnowvcvnp`)를 기준으로 개발한다 (로컬 Docker
  아님 — VPN 낀 네트워크에서 LAN 접근이 불안정해 Phase 3부터 전환함, 상세:
  `docs/decisions/dev-environment-cloud-and-tunnels.md`).
- 각 앱의 `.env.example`을 보고 `.env`를 채울 것 (`.env`는 전부 gitignore됨). 시크릿 키는
  대화 중에 값 자체를 노출하지 말고, 사용자가 직접 파일에 입력하도록 안내한다.
- `apps/web`은 Vercel에 배포되어 있다: https://ttangttang-web.vercel.app (Production/Preview
  Environment 둘 다 지금은 dev Supabase 프로젝트를 가리킨다 — `docs/decisions/
  environment-separation.md`). 실기기 테스트 시 `apps/mobile/.env`의 `EXPO_PUBLIC_WEB_ORIGIN`은
  기본적으로 이 주소를 쓴다(더 이상 ngrok 불필요). `apps/web` 자체를 로컬에서 고치며 폰으로
  확인할 때만 `pnpm web:dev` + 별도 https 터널(ngrok 등)로 일시적으로 바꿔 쓴다.
- Expo 번들러(Metro) 연결은 `expo start --tunnel`로 한다 (LAN IP 감지가 이 네트워크 환경에서
  불안정하기 때문 — 위 web origin과는 별개의 터널이다).

## 진행 상황

- **Phase 1 (골격)** — 완료. 모노레포 셋업, Supabase 스키마+RLS+공개 뷰, 수락 원자성(§3),
  billing_keys 분리, 철회 남용 방지 정책, 웹 3종(랜딩/약관/공유랜딩).
- **Phase 2 (앱 코어)** — 완료. 카카오 인증 스캐폴딩(실 키 미설정, Phase 4~5로 이월),
  (tabs) 홈피드/등록/거래, item/[id] 상세, 프로토타입 기준 티켓/경매스트립 컴포넌트.
- **Phase 3 (지원과 돈)** — 코드 완료, 실기기 E2E 검증 진행 중.
  - Toss Payments 빌링 연동 (`apps/web/lib/payments/`, 인터페이스 분리 — §4 참고).
  - 카드등록 웹뷰 콜백 (`apps/web/app/pay/*`, `/api/billing/callback`).
  - 수락=결제 체인 API (`apps/web/app/api/applications/[id]/accept`).
  - 지원서 작성/철회, 판매자 지원서 목록/수락, 낙찰 확정(땅땅 더블 노크 스탬프).
  - 카카오 미설정 상태에서 실기기 테스트를 위해 `__DEV__` 전용 이메일/비밀번호 로그인 추가.
  - `scripts/e2e-flow.mjs` — 폰 없이 매물등록/제약/카드등록 바인딩/수락 API 결제 체인/messages RLS를
    검증하는 헤드리스 스크립트(`pnpm e2e`). 스크립트가 모의 토스 서버(`scripts/lib/mock-toss.mjs`)와
    apps/web dev 서버를 직접 띄우고 `TOSS_API_BASE`로 연결한다 — 토스 성공/거절/예외/타임아웃과
    결제 취소 보상 경로를 실카드 없이 검증 (근거: `docs/decisions.md` 1단계).
  - 결제 체인 보강(2026-09-27, `docs/launch-audit.md` §4·§7): 결과 모름 → orderId 대조, 확정 실패 →
    결제 취소 보상, `payment_incidents` 기록, 카드 등록 1회용 세션(`billing_auth_sessions`).
  - Supabase CLI는 dev 프로젝트에 link됨. 무료 플랜이라 7일 무활동이면 일시정지된다(대시보드에서 복구).
  - 남은 것: 실기기 1회 E2E(카드등록→지원→수락→결제 승인→토스 결제창 인앱 복귀→확정) 통과 확인.
- **Phase 4 (신뢰 루프)**, **Phase 5 (출시)** — 미착수.

일자별 작업 기록은 `docs/daily/`, 기술적 의사결정은 `docs/decisions/`, 트러블슈팅은
`docs/troubleshooting/`, 이력서용 PAR 소재는 `docs/par-materials.md`에 있다.
