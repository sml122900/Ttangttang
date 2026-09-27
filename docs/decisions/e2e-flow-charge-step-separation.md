# 헤드리스 E2E 스크립트에서 결제 승인 단계를 분리(SKIP_CHARGE)

> **대체됨 (2026-09-27)**: e2e는 이제 모의 토스 서버(`TOSS_API_BASE`)로 결제 체인 전 경로를 검증한다.
> `SKIP_CHARGE`/`TEST_CARD_*`는 제거됐다. 근거는 `docs/decisions.md` 1단계.

## Problem
Phase 3 핵심 플로우(§3 PROJECT.md: 지원→수락→자동결제→낙찰)를 폰 없이 스크립트로 검증하고
싶었다. 매물 등록·지원서 제출·수락 API 호출·messages RLS는 Supabase 클라이언트와 `fetch`만
있으면 재현 가능했지만, "수락=결제" 체인의 실제 결제(charge) 부분은 토스 빌링 API를 직접
호출해야 했다. 그런데 토스 공식 문서(`docs.tosspayments.com/blog/how-to-test-toss-payments`)를
확인한 결과 "테스트용 국내 카드번호는 없어요" — 자동결제 승인을 실제로 검증하려면 시크릿 키가
test 키라도 **실카드 정보**가 필요했다(상세: [[toss-billing-no-dedicated-test-card]]).
이 카드 정보를 재사용 가능한 스크립트의 `.env`에 평문으로 계속 보관하는 건 받아들이기 어려운
리스크였고, 애초에 실제 결제창 승인·앱 복귀 흐름은 실기기에서 별도로 검증해야 하는 항목이라
스크립트와 역할이 겹쳤다.

## Action
`scripts/e2e-flow.mjs`에 `SKIP_CHARGE` 환경변수(기본값 `true`)를 도입해 검증 범위를 둘로
쪼갰다.
- **기본값(`true`)**: 매물 등록 → pickup_slots 검증 → 지원서 제출 → 판매자의 applications
  목록 조회까지만 accept API 호출 없이 검증한다. 4단계(messages RLS)에 필요한
  `transactions` 행은 `accept_application`/`finalize_accepted_application`을 거치지 않고
  service role 클라이언트로 직접 insert해서, 결제 여부와 무관하게 RLS만 독립적으로 검증한다.
  이 경로는 `TOSS_SECRET_KEY`/카드 정보를 전혀 요구하지 않는다.
- **`SKIP_CHARGE=false`**: 기존처럼 토스 "인증 없이 카드정보로 빌링키 발급" API로 실카드
  정보를 넣어 진짜 빌링키를 만들고, accept API의 실제 결제 체인(`chargeBilling` →
  `finalize_accepted_application`)까지 검증한다. 이 값을 켤 때만 카드 정보 관련 환경변수를
  필수로 요구하도록 `loadEnv()`의 필수 항목 목록을 분기했다.

## Result
- 회귀 검증이 필요한 대부분의 로직(매물/지원서/RLS)은 카드 정보 없이 매번 안전하게
  `pnpm e2e`로 돌릴 수 있게 됐다 — 재사용성이 애초 목표였던 스크립트의 취지에 더 맞다.
- 카드 정보를 다루는 유일한 경로가 "명시적으로 `SKIP_CHARGE=false`를 켠 1회성 검증"으로
  좁혀져, 평문 시크릿이 상시 필요하지 않게 됐다.
- 실제 결제 승인(카드사 응답)과 토스 결제창의 인앱 복귀는 원래 계획대로 실기기 E2E에서
  검증하는 것으로 역할이 명확해졌다 — CLAUDE.md 진행상황의 "실기기 1회 E2E" 항목과 정합.
- **이력서 소재**: "외부 결제 API의 테스트 환경 제약(전용 테스트 카드 부재)을 문서로 확인한 뒤,
  민감정보를 스크립트에 상시 보관하지 않도록 검증 범위를 '결제 없이 매번 자동화 가능한 부분'과
  '결제 승인이 필요해 실기기에서 1회 확인할 부분'으로 재설계함."
