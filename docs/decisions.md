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

## 2단계 마무리 — Vercel 배포 후 (2026-09-28)
- **payment_incidents 웹훅 릴레이의 스킵 동작을 실제로 curl로 검증했다**: 시크릿 미설정/시크릿 설정+Discord URL 미설정/잘못된 시크릿 세 가지 경우를 로컬 서버로 재현해 200/200/401을 확인 — 코드를 읽고 "될 것 같다"로 끝내지 않았다.
- **eas.json production 프로필의 WEB_ORIGIN은 이번에도 채우지 않았다**: dev/preview에 쓴 Vercel URL을 그대로 넣으면 스토어 제출 빌드가 dev Supabase(이 Vercel 배포의 현재 Production Environment가 가리키는 곳)에 실사용자 데이터를 쓰게 된다. prod Supabase + Vercel Production Environment 교체가 끝난 뒤에만 채운다.
- **CLAUDE.md·dev-environment-cloud-and-tunnels.md의 ngrok 서술은 "web에는 더 이상 불필요, Expo 번들러 터널은 별개로 계속 필요"로 갱신**했다: apps/web은 안정적 URL이 생겼지만 Metro 번들러 연결은 여전히 LAN 불안정 문제가 남아있어 `expo start --tunnel`은 그대로 쓴다.

## 3단계 — 설정 화면 → 계정 삭제 → 신고·차단 → 온보딩
- **auth.users는 하드 삭제 대신 소프트 삭제(`admin.deleteUser(id, true)`)로 구현했다**: `profiles.id`가 `auth.users(id)`를 `on delete cascade`로 참조하는데, `items`/`applications`/`transactions`/`messages`가 `profiles(id)`를 cascade 없이(RESTRICT) 참조한다. auth.users를 물리적으로 지우면 그 cascade가 profiles까지 내려가고, 그 순간 거래 이력이 있는 사용자는 RESTRICT에 걸려 삭제 자체가 실패한다 — "auth.users 삭제"와 "거래·메시지 보존"을 동시에 만족하는 유일한 방법이 소프트 삭제였다. 로그인 수단 무효화·identity 제거는 그대로 되고, FK만 깨지지 않는다. `scripts/verify-stage3.mjs`로 재로그인 거부 + profiles 행 생존을 직접 확인했다.
- **진행 중(paid) 거래가 있으면 탈퇴를 막는다**: 사용자가 명시적으로 결정하지 않은 부분이라 가장 보수적인 기본값을 골랐다 — 돈이 오간 뒤 한쪽이 사라지면 수령 확인·노쇼 정산을 아무도 못 하게 된다. 되돌리기 쉬운 제약(그냥 거래가 끝나길 기다리면 됨)이라 우선 이렇게 하고, 필요하면 나중에 완화한다.
- **탈퇴 시 내 live 매물은 취소 처리한다**: 판매자가 사라지면 어차피 응대할 수 없는 매물이라, 남겨두면 구매자만 지원서를 쓰고 낙찰받을 수 없는 상태가 된다.
- **웹 계정 삭제는 즉시 자동 처리가 아니라 요청 접수 + 수동 처리**: 이 서비스는 카카오 로그인만 있고 별도 웹 로그인이 없어, 본인 확인 없이 웹에서 즉시 삭제를 실행할 방법이 없다. 플레이스토어 정책은 웹 경로가 "요청 처리 과정"이어도 된다고 허용하므로(즉시 자동일 필요는 없음), 인앱 경로(즉시 자동)와 웹 경로(요청 접수)로 역할을 나눴다.
- **차단의 "상호 비노출"은 매물 피드 노출과 새 지원서 제출까지만 막는다**: 이미 결제가 끝난 거래의 채팅까지 소급 차단하면 수령 조율(픽업 약속)이 끊긴다. 돈이 걸린 뒤에는 차단보다 거래 완결이 우선이라고 판단했다.
- **blocks.blocked_nickname은 client가 아니라 `block_user()` SECURITY DEFINER 함수가 서버에서 조회해 저장한다**: 클라이언트가 임의 문자열을 넣을 수 없게 하고, 상대의 `public_profile_for_counterparty` 노출 범위(거래·지원 관계가 있어야 보임)와 무관하게 차단 자체는 UUID만으로 가능하게 하기 위해서다. 나중에 상대가 탈퇴해도 "내가 누구를 차단했는지"는 차단 시점 닉네임으로 남는다.
- **실제 버그를 하나 잡았다 — RLS 정책 안에서 다른 RLS 테이블을 직접 서브쿼리로 참조하면 그 서브쿼리도 호출자 기준 RLS를 적용받는다.** `items_select_public`이 `blocks`를 직접 참조했는데, `blocks_select_own`(blocker_id = auth.uid()) 때문에 "내가 차단한" 관계만 보이고 "나를 차단한" 관계는 그 서브쿼리 안에서 보이지 않아 차단이 한쪽 방향으로만 걸렸다. `scripts/verify-stage3.mjs`의 상호 비노출 테스트가 실제로 이 비대칭을 잡아냈다 — 이 저장소가 이미 같은 이유로 `is_withdraw_restricted()`를 SECURITY DEFINER로 만들어둔 선례가 있었는데도 처음엔 놓쳤다. `is_blocked_pair()`/`is_applicant_blocked_from_item()`을 SECURITY DEFINER로 추가해 고쳤다(`supabase/migrations/20260928000300_block_enforcement_fix.sql`).
- **설정 화면은 4번째 탭이 아니라 거래 탭 헤더의 텍스트 링크**: PROJECT.md §5 "탭바 3종 + 뒤로가기 + 상태 체크 외 아이콘 금지" 규칙과 충돌하지 않으려면 새 아이콘도, 새 탭도 안 된다 — 텍스트 링크는 "위계는 굵기·자간으로만"이라는 같은 절의 원칙과도 맞는다.
- **계정 삭제 확인 시트는 MoneySheet(돈 레지스터)를 그대로 쓴다**: billing_keys 삭제를 포함하는 되돌릴 수 없는 결정이라 §5의 "수락 확인" 같은 무게가 맞다. 신고·차단 시트는 돈이 아니라 새로 만든 자체 시트(§5 2-레지스터 위반 방지).
- **카카오 로컬 API 키는 새로 발급받지 않고 기존 OAuth REST API 키를 재사용한다**: 카카오는 앱 하나의 REST API 키로 로그인과 로컬 API를 겸한다. 서버 전용(`apps/web/.env`의 `KAKAO_REST_API_KEY`)으로만 두고 모바일 번들에는 넣지 않았다 — 이 저장소의 다른 모든 서드파티 키(TOSS_SECRET_KEY 등)와 같은 원칙.
- **온보딩 동네 검색은 API 실패 시 "직접 입력한 값 그대로 쓰기" 폴백을 넣었다**: 실제로 `KAKAO_REST_API_KEY`가 아직 플레이스홀더(`placeholder_client_id`)라 로컬 API 호출이 401로 막히는 걸 직접 확인했다 — 이 상태에서 검색 결과가 하나도 안 나오면 온보딩 3단계가 막혀 앱을 아예 못 쓰게 될 뻔했다. 실 키가 없어도 온보딩은 끝낼 수 있어야 한다고 판단해 폴백을 추가했다.
- **verify-stage3.mjs를 pnpm e2e와 별도 스크립트로 뒀다**: 계정 삭제 테스트가 매번 새 throwaway 계정을 만들고 실제로 소프트 삭제(로그인 수단 무효화)시키는데, pnpm e2e는 고정된 seller/buyer/outsider 계정을 재사용하는 구조라 같은 스크립트에 섞으면 그 계정들이 이후 실행에서 로그인 불가능해진다.

## 4단계 — 사진/AI 어시스트 → 수령시한 → 수령확인 → 노쇼 cron → 수령률 → 푸시 → 카드관리 → 매물 수정삭제
- **알림·노쇼 정산은 apps/web을 거치지 않고 pg_cron + pg_net으로 DB가 직접 처리한다**: 지원서 삽입/상태 변경이 전부 모바일→Supabase 직접 호출이라 API 레이어가 없다. 2단계에서 Discord 웹훅에 쓴 "DB가 직접 외부 HTTP를 부른다" 패턴을 그대로 재사용해, 트리거로 `notifications` 아웃박스에 적재하고 같은 10분 크론에서 Expo 푸시 API를 직접 호출한다. 새 서버 컴포넌트(Edge Function 등)를 안 만들어도 된다.
- **푸시 발송은 발사-후-망각(best-effort)이다**: `net.http_post`는 비동기라 Expo가 실제로 수신했는지 확인·재시도하지 않는다. 델리버리 보장이 필요해지면 `net._http_response`를 폴링하는 재시도 잡을 추가해야 하는데, 지금 규모에서는 과설계라 판단해 넘겼다.
- **profiles.receive_rate/trade_count는 증분이 아니라 매번 재계산한다**: 증분(+1/+1%)은 재시도·동시 실행에서 어긋나기 쉽다. 거래 건수가 적은 MVP 규모에서는 매번 다시 세는 비용이 무시할 만해서, 항상 정답과 같은 재계산 쪽을 택했다.
- **auth.users를 실제로 소프트 삭제해보면서 얻은 확신 덕에, confirm_pickup의 items.status 전이 버그를 코드 리뷰만으로 찾았다**: item_status enum에 'completed'가 있는데 그 값으로 전이시키는 코드가 어디에도 없었다 — 테스트를 작성하며(items.status 검증 항목을 넣으려다) 발견해 같은 단계에서 고쳤다.
- **매물 "삭제"는 물리적 DELETE가 아니라 cancelled로의 상태 전이다**: 이미 있던 `items_update_own_live_or_cancel` RLS가 이 전이를 허용하고 있어 새 정책이 필요 없었다. 취소 시 대기 지원서를 자동 거절하는 트리거를 추가해, 응답 없이 방치되는 지원서가 없게 했다.
- **시작가는 트리거로 물리적으로 막는다**: UI에서만 막으면 클라이언트를 우회한 직접 update로 바뀔 수 있다 — §0 규칙 1의 "고정 3택"을 등록 후에도 지키려면 DB 레벨 강제가 맞다.
- **노쇼가 난 매물은 재판매가 안 된다는 걸 발견했다 (기존 제약)**: `transactions.item_id`가 UNIQUE라서다. 이번 스테이지에서 고치라고 요청받지 않았고, 고치려면 "매물당 거래 여러 번"이라는 더 큰 데이터 모델 결정이 필요해 보여 손대지 않고 감사 문서에 남겼다.
- **Toss 카드 정보 필드명을 추측으로 여러 개 시도한다**: 테스트 키로는 카드 등록 자체가 막혀 실제 응답 스키마를 볼 수 없었다(7/31 이미 겪은 문제, `toss-billing-no-dedicated-test-card.md`). 틀려도 두 컬럼 다 nullable이라 카드 등록/결제 자체에는 영향이 없어, 확정 대신 방어적 다중 시도 + 주석으로 남기는 쪽을 택했다.
- **AI 어시스트는 Bearer 인증을 요구한다**: 매 호출이 Claude API 비용이라 익명 남용을 막아야 했다. imageUrl도 우리 Storage 버킷 접두사인지 검사한다 — 아니면 서버가 임의 URL을 그대로 fetch하는 SSRF 통로가 된다.
- **verify-stage4.mjs도 pnpm e2e/verify:stage3와 별도 스크립트로 뒀다**: 매번 새 throwaway 계정을 만들고 Storage에 실제 파일을 올리는 등 부수효과가 있어, 고정 계정을 재사용하는 e2e와 섞으면 안 된다는 같은 이유.
