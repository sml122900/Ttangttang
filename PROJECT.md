# 땅땅 (코드명 ttangttang) — PROJECT.md v2.1

하이퍼로컬 중고나눔·소액거래 앱. 무료나눔의 진상 문제(찜하고 잠수, 노쇼, 유세)를
**지원서 기반 선택권(판매자가 갑) + 수락 즉시 자동결제(구속력)**로 해결한다.

한 줄 컨셉: "입찰은 지원서로, 확정은 땅땅 — 봉은 판매자가 두드린다."

## 0. 핵심 규칙 (제품의 헌법 — 모든 구현 판단의 기준)

1. **시작가는 1,000 / 3,000 / 5,000원 고정 3택.** 판매자는 가격을 고민하지 않는다.
2. **받고 싶으면 '지원서'를 쓴다.** 제시가(시작가 이상 자유, 시작가 그대로도 가능) +
   방문 가능 시간 + 한 줄 메시지. 30초 안에 작성 가능해야 한다.
3. **지원 시 카드 등록(빌링키), 결제는 수락 순간.** 지원 단계에서 돈이 빠지지 않는다.
   이것이 참여 장벽과 구속력을 동시에 잡는 이 서비스의 핵심 메커니즘이다.
4. **판매자의 수락 = 낙찰 = 즉시 자동결제.** 낙찰자는 취소 불가. 나머지 지원자에게는
   자동 거절 통보. 판매자는 마감을 기다릴 필요 없이 언제든 수락할 수 있다.
5. **약속 시간 내 미수령(노쇼) 시 결제금 전액이 위약금으로 판매자에게 자동 정산.**
6. 최고 제시가와 지원자 수는 공개, 지원자 정보는 판매자에게만. 수수료 0원 (MVP).

이 규칙과 충돌하는 기능 요청이 생기면 구현 전에 반드시 되물을 것.

---

## 1. 스택 & 레포 구조

| 영역 | 선택 | 비고 |
|---|---|---|
| 모바일 | Expo SDK 최신 + expo-router + TypeScript | Android 우선, iOS 후속 |
| 스타일 | NativeWind v4 | 디자인 토큰 §5 준수 |
| 웹 + API | Next.js (App Router) + TypeScript | 랜딩/약관/공유랜딩 3종. 거래 기능 없음 |
| DB/Auth/Realtime | Supabase (Postgres + RLS) | Auth: 카카오 OAuth + 전화번호 |
| 결제 | Toss Payments **빌링(자동결제) + 일반결제** | 정산·계약 리스크 §4 |
| 푸시 | Expo Notifications (FCM/APNs) | 지원 도착·낙찰·거절·수령임박·정산 |
| 배포 | EAS Build / Vercel | |

```
ttangttang/
├── apps/
│   ├── mobile/          # Expo 앱 (거래 전체)
│   └── web/             # Next.js — 랜딩, 약관, share/item/[id], API routes
├── packages/
│   ├── shared/          # 타입, zod 스키마, 상수(시작가 3택 등)
│   └── tokens/          # 디자인 토큰 (§5)
├── supabase/            # migrations, edge functions (noshow-cron 등)
└── PROJECT.md
```

pnpm workspace 모노레포. 모바일과 웹이 `shared`의 타입·스키마를 공유한다.

---

## 2. 데이터 모델 (v2 초안)

```sql
create table profiles (
  id uuid primary key references auth.users,
  nickname text not null,
  neighborhood text not null,
  receive_rate numeric default 100,   -- 수령률 % (신뢰 지표)
  trade_count int default 0,
  withdraw_count int default 0,       -- 지원 철회 횟수 (남용 감지, 누적)
  created_at timestamptz default now()
);

-- 결제 자격증명은 profiles와 분리 보관 (service_role 전용, 클라이언트 정책 없음).
-- 클라이언트는 has_billing_key() RPC(boolean)로만 등록 여부를 확인한다.
create table billing_keys (
  profile_id uuid primary key references profiles(id),
  billing_key text not null,          -- 토스 빌링키 (최초 지원 시 발급, 재사용)
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create type item_status as enum ('live', 'awarded', 'completed', 'cancelled');

create table items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles(id),
  title text not null,
  description text not null,
  start_price int not null check (start_price in (1000, 3000, 5000)),
  photos text[] not null default '{}',
  neighborhood text not null,
  status item_status not null default 'live',
  apply_deadline timestamptz,          -- 선택적 마감 (null = 무제한, 수락 시 즉시 종료)
  pickup_slots text[] not null default '{}' check (cardinality(pickup_slots) between 1 and 4),
                                        -- 판매자가 등록 시점에 입력하는 실제 방문 가능 시간(1~4개,
                                        -- 자유 텍스트). 구매자는 지원서 작성 시 이 중 하나를 고른다.
  created_at timestamptz default now()
);

create type app_status as enum
  ('pending', 'accepted', 'rejected', 'withdrawn', 'payment_failed');

create table applications (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id),
  applicant_id uuid not null references profiles(id),
  offer_price int not null,            -- 시작가 이상 (API에서 검증)
  visit_time text not null,            -- items.pickup_slots 중 구매자가 고른 값 그대로 저장
                                        -- (자유 텍스트 컬럼이라 값의 출처만 바뀌었을 뿐 스키마는 그대로)
  message text,                        -- 한 줄 메시지 (선택)
  status app_status not null default 'pending',
  created_at timestamptz default now(),
  unique (item_id, applicant_id)       -- 매물당 1인 1지원 (수정은 upsert)
);

create type tx_status as enum ('paid', 'completed', 'noshow_settled', 'refunded');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) unique,
  application_id uuid not null references applications(id) unique,
  buyer_id uuid not null references profiles(id),
  seller_id uuid not null references profiles(id),
  amount int not null,                 -- 낙찰가 (offer_price)
  toss_payment_key text not null,
  status tx_status not null default 'paid',
  pickup_deadline timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create table messages (
  id bigint generated always as identity primary key,
  tx_id uuid not null references transactions(id),
  sender_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz default now()
);
```

RLS 필수. 특히 applications: 본인 것 + 자기 매물의 지원서만 읽기 가능.
**공개 뷰 별도 제공**: 매물별 `지원자 수, 최고 offer_price`만 노출하는 view
(지원자 신상·개별 지원서는 판매자 전용).

---

## 3. 핵심 플로우 — 수락(낙찰)의 원자성 (가장 중요한 엔지니어링 포인트)

**구조가 바뀌며 좋아진 점**: v1의 "결제 전 락 선점"이 필요 없다. 동시성의 임계 구간이
구매자들의 결제 경쟁에서 **판매자의 단일 수락 행위**로 이동했기 때문. 남는 레이스는
"판매자 수락 vs 지원자 철회"뿐이며 아래처럼 DB 레벨에서 해소한다.

```
[지원]  POST /api/items/:id/apply
   - has_billing_key() 없으면 → 토스 카드등록(빌링키 발급) 웹뷰 먼저 (billing_keys에 저장)
   - offer_price >= start_price 검증 → applications upsert (재지원 = 금액/시간 수정)
   - 30일 내 철회 3회 초과로 지원 제한 중이면(아래 [철회] 참고) 지원 자체를 막는다
   - 판매자 푸시: "새 지원서가 도착했어요 — 5,000원 제시"

[철회]  POST /api/applications/:id/withdraw
   - status='pending'인 경우에만 'withdrawn'으로 (수락 후 철회 불가)
   - withdraw_count 증가 + 철회 시각 기록. **30일 내 철회 3회 초과 시 7일간 신규 지원 제한**
     (남용 방지 — 4번째 철회 시점부터 7일간 [지원]이 막힌다)

[수락 = 낙찰]  POST /api/applications/:id/accept  ← 임계 구간
   1) DB 트랜잭션:
      UPDATE applications SET status='accepted'
        WHERE id=:id AND status='pending'           -- 철회와의 레이스를 원자적으로 차단
      UPDATE items SET status='awarded' WHERE id=:item AND status='live'
      둘 중 하나라도 0 rows → 롤백, 409 반환 ("이 지원서는 방금 철회됐어요")
   2) 토스 빌링키 결제 실행 (offer_price)
      - 성공 → transactions INSERT, 나머지 pending 지원서 일괄 'rejected'
               + 낙찰자/탈락자/판매자 푸시 발송
      - 실패 → 해당 지원서 'payment_failed', items 'live'로 복원,
               판매자에게 "결제 실패 — 다른 지원서를 선택해주세요" 안내
   * 판매자 화면에서는 1)+2)가 하나의 "수락하기" 버튼. 결제 완료까지 로딩으로 처리.

[노쇼 정산]  scheduled edge function (10분 주기)
   - status='paid' AND pickup_deadline < now() → 'noshow_settled'
   - 판매자 정산 큐 적재 + 양측 푸시. 수령 완료는 구매자 확인 + 판매자 확인 이중 체크.
```

빌링키는 profiles에 1회 발급 후 재사용 → 두 번째 지원부터는 지원서 작성만으로 끝
(30초 규칙 충족). 카드 변경/삭제 화면 필요.

---

## 4. ⚠️ 결제·정산 리스크 (개발과 병행해서 해결할 것)

1. **빌링(자동결제) 계약**: 토스페이먼츠 빌링은 일반결제와 별도 심사·계약 항목.
   "수락 시 자동결제" 모델이 성립하려면 필수. 가맹 심사 시 서비스 소개·약관 URL 요구
   → 웹 3종을 Phase 1에 먼저 배포하는 이유.
2. **C2C 정산**: 구매자 돈을 판매자에게 지급하는 구조는 일반 PG 가맹만으로 불가
   (당근페이가 선불전자지급수단 라이선스를 가진 이유).
   1순위: 토스페이먼츠 지급대행(서브몰) 심사. 폴백: 클로즈드 베타 동안 주 1회 수동 정산.
3. **약관**: 청약철회 제한(전자상거래법 17조 예외 구성) + 위약금 규정 + "수락 즉시
   자동결제" 동의 문구. 지원서 제출 버튼에 명시적 고지 필수. 법률 검토 항목으로 표기.
4. **런칭 전 확인**: 로컬 Supabase Postgres(Docker)에서 함수 EXECUTE 권한 거부 시
   Postgres 백엔드 전체가 크래시(WAL 크래시 복구 재시작)하는 현상을 발견함 (테이블 권한
   거부는 정상 동작, 함수 호출만 이 현상 발생). hosted 프로젝트에서도 재현되는지는 아직
   미검증 — 실제 운영/개발 프로젝트에 크래시 이력을 남기지 않기 위해 격리된 일회용
   Supabase 프로젝트에서 별도로 테스트할 것. 재현되면 DoS 벡터로 별도 대응 필요.

미해결이어도 개발은 진행하되, 결제 모듈은 정산 방식 교체가 가능하도록 인터페이스 분리.

---

## 5. 디자인 시스템 — 2-레지스터 규칙

Material 3 골격 위에 두 레지스터를 화면 성격에 따라 전환한다. **전환 자체가 규칙이다.**

**동네 레지스터** (피드, 상세, 지원서 작성, 채팅, 프로필): 당근 문법 + 배민식 위트.
큰 썸네일, 둥근 프로필, 수령률 지표. 톤 예시: "입찰은 없다, 낙찰만 있다".
지원서는 무겁지 않게 — 알바 지원보다 가볍고 댓글보다 진지한 톤.

**돈 레지스터** (카드 등록, 자동결제 동의 고지, 수락 확인, 정산, 거래내역): 토스 문법.
위트 금지, 장식 금지, 금액 크게, 규칙 건조하게, tabular-nums.
판매자의 "수락하기" 확인 시트는 결제 행위이므로 돈 레지스터.

```ts
// packages/tokens/index.ts
export const colors = {
  brand: '#4059C8',        // 천원권 블루
  brandPress: '#3348A8',
  brandTint: '#EEF1FC',
  point: '#0BA05C',        // 낙찰/정산 그린
  pointTint: '#E8F7F0',
  ink: '#191F28', ink2: '#333D4B',
  sub: '#6B7684', sub2: '#8B95A1',
  line: '#E5E8EB', lineSoft: '#F2F4F6',
  surfaceWarm: '#FDFBF7',  // 동네 레지스터 배경
  surfaceMoney: '#FFFFFF', // 돈 레지스터 배경
  danger: '#E5503C',
};
export const START_PRICES = [1000, 3000, 5000] as const;
```

시그니처: **"땅땅" 사운드-모션 아이덴티티.** 판매자가 수락하는 순간
경매봉이 두 번 두드려진다 — 더블 노크 모션(티켓이 두 번 울림) + 햅틱 2회 +
짧은 봉 소리(설정에서 끌 수 있게). 이 순간 하나에만 모션·사운드를 허용한다.
티켓형 가격 태그(절취선+노치)는 "낙찰 티켓"으로 유지하며, 확정 시 "땅땅" 스탬프가 찍힌다.
매물 카드에는 `최고 제시가 티켓 + 지원 n명` 을 표기해 경매의 긴장감을 시각화.

**브랜드 언어 (전 화면 통일)**: 수락 버튼 = "땅땅 치고 낙찰 확정" /
낙찰 푸시 = "땅땅! 낙찰됐어요" / 판매자 안내 = "마음에 드는 지원서에 땅땅 치세요" /
탈락 알림 = "이번엔 다른 이웃에게 낙찰됐어요" (탈락엔 위트 금지, 담백하게).
신뢰 장치("노쇼 보장")는 에어커버처럼 독립 네이밍·독립 안내 화면.
아이콘 최소주의: 탭바 3종 + 뒤로가기 + 상태 체크 외 금지. 위계는 굵기·자간으로만.

---

## 6. 화면 명세 (MVP)

모바일 (expo-router):
```
app/
├── (tabs)/
│   ├── index.tsx           # 홈 피드 — 최고 제시가 티켓, "지원 n명" 칩
│   ├── post.tsx            # 등록 — 사진, 제목, 시작가 3택, 방문 가능 시간 슬롯(1~4개), 설명, 수령시한
│   └── trades.tsx          # 거래 — 내 지원(진행/낙찰/탈락) + 내 매물(지원 현황) + 정산.
│                           #   헤더 우측 "설정" 텍스트 링크(아이콘 아님, §5 최소주의)로 settings.tsx 진입
├── item/[id].tsx           # 상세 — 최고가/지원자수, 신뢰 안내, CTA "지원서 쓰기 (30초)"
│                           #   (내 매물이면 CTA가 "내 매물 · 지원서 보기"로 분기). 신고하기 링크
├── item/[id]/apply.tsx     # 지원서 — 제시가, 매물의 pickup_slots 중 방문 가능 시간 선택, 한 줄 메시지
│                           #   최초 1회: 카드 등록(빌링키) 웹뷰 선행
├── item/[id]/applicants.tsx# [판매자 전용] 지원서 목록 — 제시가·시간·메시지·수령률
│                           #   "수락하기" → 돈 레지스터 확인 시트 → 자동결제 → 낙찰. 지원자별 신고·차단
├── chat/[txId].tsx         # 낙찰 후 거래 채팅 (Realtime). 상대 신고·차단
├── onboarding.tsx          # 로그인 직후 1회(신규 가입자만) — 환영 → 닉네임 확인 → 동네 설정
│                           #   (카카오 로컬 API 현위치 자동 설정 + 수동 검색, 3장)
├── settings.tsx            # 계정 설정 — 카드 재등록, 차단 목록, 로그아웃, 약관·처리방침, 계정 삭제
│                           #   (settings/payment.tsx의 "카드 관리"를 이 화면에 통합했다 — 카드 조회/
│                           #   개별 삭제 등 전체 CRUD는 아직 없음, §7 백로그)
└── guarantee.tsx           # 노쇼 보장 안내 (독립 브랜딩 화면) — 아직 없음, §7 백로그
```

웹 (Next.js):
```
app/
├── page.tsx                # 랜딩 — 서비스 소개 + 스토어 링크
├── terms/  privacy/        # 약관 · 개인정보처리방침 (PG/스토어 심사용)
├── account/delete/         # 계정 삭제 웹 요청 페이지 (플레이스토어 데이터 삭제 정책 — 앱을
│                           #   못 쓰는 사용자용. 인앱 삭제는 settings.tsx가 즉시 처리)
└── share/item/[id]/        # 공유 랜딩 — SSR + OG 태그("현재 최고 3,000원 · 지원 4명")
                            #   + 앱 딥링크. 카톡 확산의 핵심
```

## 7. 개발 순서

- **Phase 1 — 골격 (웹 먼저)**: 모노레포 셋업 → Supabase 스키마+RLS+공개 뷰 →
  웹 3종 배포 (PG 심사 요건 선확보, 빌링 계약 신청 병행)
- **Phase 2 — 앱 코어**: 인증(카카오) → 피드/상세/등록 → 토큰·티켓 컴포넌트
- **Phase 3 — 지원과 돈**: 카드 등록(빌링키) → 지원서 작성/수정/철회 →
  판매자 지원서 목록 → 수락=자동결제 원자 처리(§3) → 거래 탭
- **Phase 4 — 신뢰 루프**: 채팅 → 푸시 5종 → 노쇼 cron → 수령 확인 → 수령률 지표
- **Phase 5 — 출시**: 안드로이드 내부테스트 → 클로즈드 베타(동네 1곳, 수동 정산 폴백)
  → 스토어 심사

각 Phase 완료 시점에 §0 규칙과 대조 검증할 것.

**네이밍 확정 전 체크 (Phase 1 시작과 병행)**: ① 플레이스토어/앱스토어 "땅땅" 검색 —
'땅' 계열 부동산 앱(땅야 등)과의 혼동 여부 ② KIPRIS 상표 35류·42류 선점 확인
③ 도메인 및 로마자 표기 통일 결정 (ttangttang vs ddangddang — 패키지명·번들ID·도메인에
동일 표기 사용).
