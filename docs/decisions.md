# 결정 로그 (한 줄 근거)

`docs/launch-audit.md` §6의 결정 중 사용자 결정이 아닌 것, 그리고 실행 중 내린 판단을 한 줄씩 남긴다.
굵직한 설계는 `docs/decisions/*.md`에 따로 쓴다.

## 사용자 결정 (2026-09-27)
- B1 결제 체인 수정 승인 / A1 익명화 소프트 삭제(auth.users·billing_keys 삭제, profiles는 "탈퇴한 사용자"로 유지, 거래·메시지 5년 보존) / 심사관 로그인 = 프로덕션에도 이메일 로그인을 "다른 방법으로 로그인" 뒤에 배치 / 동네 = 카카오 로컬 API 현위치 + 수동 검색 / 현 Supabase = dev·e2e 전용, prod 프로젝트는 사용자가 생성 / 봉 소리·설정 토글 = 이번 범위 제외.

## 1단계 — 돈
- **e2e는 진짜 토스 대신 모의 토스 서버로 돌린다**: `TOSS_API_BASE`만 바꿔 `lib/payments/toss.ts` 실코드(타임아웃·멱등키·에러 해석)를 그대로 태우는 것이 게이트웨이 자체를 가짜로 바꾸는 것보다 검증 범위가 넓다. 실카드 모드(`SKIP_CHARGE=false`, `TEST_CARD_*`)는 제거 — 실결제 확인은 폰 체크리스트로 넘긴다(`docs/decisions/e2e-flow-charge-step-separation.md`를 대체).
- **토스 5xx·네트워크 예외·타임아웃은 "거절"이 아니라 "결과 모름"으로 분류**하고 `GET /payments/orders/{orderId}`로 대조한다 — 토스 쪽에서 결제됐을 수 있기 때문.
- **조회도 실패하면 되돌리고(payment_failed) 502 + `payment_incidents` 기록**: 매물을 awarded에 묶어두면 판매자가 영영 못 팔고, 늦은 승인은 기록을 보고 수동 환불하는 편이 낫다.
- **확정 실패 후 결제 취소마저 실패하면 되돌리지 않는다**: 매물이 live로 돌아가면 다른 지원자에게 또 결제되어 이중 결제가 생긴다. accepted/awarded 유지 + `NEEDS_REVIEW` 기록.
- **멱등키는 `charge-{orderId}` / `cancel-{paymentKey}`**: orderId가 곧 application.id라 요청 재시도와 서버 재실행 모두에서 같은 키가 나온다.
- **타임아웃 기본 10초, route `maxDuration` 60초**: 결제(10) + 조회(10) + 취소(10) + DB 호출이 한 요청에 들어가도 넉넉하다.
- **P5는 HMAC 서명 토큰 대신 DB 1회용 세션 테이블**: 새 시크릿을 만들 필요가 없고, 1회 소비·만료(15분)·돌아갈 딥링크 저장을 한 곳에서 처리할 수 있다.
- **돌아갈 딥링크(clientRedirect)는 URL로 들고 다니지 않고 세션에 저장**: 허용 스킴(`ttangttang`, `exp`, `exp+ttangttang`)만 받고 billing-done은 세션 값만 쓴다 → 오픈 리다이렉트 차단.
- **제시가 하한은 init_schema의 기존 트리거(`enforce_offer_price_floor`)를 재사용하고 SQLSTATE 23514 + 한국어 문구만 붙인다**: 처음엔 중복 트리거를 새로 만들었다가 e2e에서 원격 DB에 트리거 두 개가 겹친 걸 발견 → 미커밋·dev 전용이라 `migration repair --status reverted` 후 파일을 고쳐 재적용. 상한은 두지 않는다(본인 카드 결제이고 §0이 "시작가 이상 자유"라서).
- **accept 에러 코드 분리(TT409 철회 / TT410 매물 마감 / TT411 이미 처리)**: 응답 유실 후 재시도한 판매자에게 "방금 철회됐어요"가 나가던 문제(P8). 원자성 로직은 그대로.
- **e2e의 철회 케이스는 withdraw RPC 대신 service role로 상태만 바꾼다**: 반복 실행 시 테스트 계정이 "30일 3회 철회" 제한에 걸리지 않게.
- **e2e가 만든 매물·지원서·거래·기록은 실행 끝에 지운다**: 클라우드 dev DB에 테스트 데이터가 계속 쌓이지 않게.

## 2단계 — 인프라
- **Vercel 프로젝트는 하나, Environment(Production/Preview/Development)로 dev·prod Supabase를 나눈다**: 웹앱을 두 개 배포하면 도메인·빌드 설정이 두 배로 늘어난다. Vercel이 이미 브랜치별 Environment를 지원하므로 그 기능을 쓰는 쪽이 더 단순하다.
- **prod Supabase로의 스키마 반영은 `db push`만 허용, `db reset --linked` 금지**: `db push`는 `seed.sql`을 건드리지 않아 데모 계정이 prod로 새는 경로가 원천적으로 없다. `seed.sql` 상단에 경고 주석을 남겨 실수를 한 번 더 막는다.
- **eas.json의 production 프로필 값은 실제 문자열 대신 `<TODO: ...>` 자리표시자로 커밋한다**: 값을 추측해서 넣으면 틀린 채로 조용히 빌드될 수 있다. 자리표시자는 빌드 시점에 바로 실패해 눈에 띈다.
- **payment_incidents → Discord는 Supabase Database Webhook을 Discord URL에 직접 연결하지 않고 Next.js 릴레이 라우트를 거친다**: Supabase의 기본 웹훅 페이로드(`{type, table, record}`)에는 Discord가 요구하는 `content`/`embeds` 필드가 없어 그대로 연결하면 400이 난다. 릴레이가 포맷을 바꾸고, Discord URL도 Supabase 프로젝트 설정 화면이 아니라 서버 env에만 있게 되어 노출 범위가 좁다.
- **웹훅 릴레이는 시크릿·URL이 비어 있으면 조용히 200을 반환한다** (throw하지 않음): 초기 배포 시점엔 아직 값이 없는 게 정상 상태이므로, 여기서 실패하면 Supabase 쪽 웹훅 재시도가 쌓인다.
- **Vercel 함수 리전을 icn1(서울)로 고정한다**: Supabase(서울)와 같은 리전에 둬야 API 레이턴시가 줄고, 개인정보처리방침의 "국내 서버" 서술과도 일치한다.
- **GitHub Actions keep-alive는 dev/prod 두 프로젝트를 한 워크플로에서 다루되 prod 시크릿이 없으면 그 스텝만 스킵한다**: prod 프로젝트가 아직 없는 지금도 워크플로를 미리 켜둘 수 있고, 나중에 시크릿만 추가하면 별도 파일 없이 확장된다.
- **개인정보처리방침의 국외 이전 여부는 단정하지 않고 "법률 검토 필요"로 남긴다**: Supabase DB가 서울 리전이라도 운영 법인(Supabase·Vercel)이 해외라 한국 개인정보보호법상 국외 이전 해당 여부가 실제로 해석이 갈리는 영역이다. 확정 짓지 않는 편이 잘못된 법률 판단보다 안전하다.
- **계정 삭제 관련 정책 문구는 3단계에서 기능이 나오는 즉시 다시 다듬어야 한다**: 지금은 정책이 아직 없는 기능(설정 메뉴, 삭제 웹페이지)을 미리 언급한다 — `launch-audit.md` "새로 발견한 리스크"에 남겨 놓쳐 잊지 않게 했다.
