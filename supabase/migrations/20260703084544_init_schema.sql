-- §2 데이터 모델 (PROJECT.md)

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null,
  neighborhood text not null,
  receive_rate numeric not null default 100,   -- 수령률 % (신뢰 지표)
  trade_count int not null default 0,
  withdraw_count int not null default 0,       -- 지원 철회 횟수 (남용 감지)
  created_at timestamptz not null default now()
);

-- 토스 빌링키는 profiles와 분리 보관한다. profiles는 (지원자 관계를 통해) 판매자에게도 일부
-- 노출되는 테이블이라, 결제 자격증명은 별도 테이블에 두고 service_role만 접근하게 한다
-- (아래 rls_policies.sql: RLS enable + 정책 없음 + 명시적 revoke, 조회는 has_billing_key()로만).
create table billing_keys (
  profile_id uuid primary key references profiles (id) on delete cascade,
  billing_key text not null,                   -- 토스 빌링키 (최초 지원 시 발급, 재사용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type item_status as enum ('live', 'awarded', 'completed', 'cancelled');

create table items (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references profiles (id),
  title text not null,
  description text not null,
  start_price int not null check (start_price in (1000, 3000, 5000)), -- §0 규칙 1
  photos text[] not null default '{}',
  neighborhood text not null,
  status item_status not null default 'live',
  apply_deadline timestamptz,                  -- 선택적 마감 (null = 무제한, 수락 시 즉시 종료)
  created_at timestamptz not null default now()
);

create index items_status_neighborhood_idx on items (status, neighborhood, created_at desc);
create index items_seller_id_idx on items (seller_id);

create type app_status as enum
  ('pending', 'accepted', 'rejected', 'withdrawn', 'payment_failed');

create table applications (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id),
  applicant_id uuid not null references profiles (id),
  offer_price int not null,                    -- 시작가 이상 (API/CHECK에서 검증)
  visit_time text not null,                    -- "오늘 저녁 7시 이후" 등 자유 입력
  message text,                                -- 한 줄 메시지 (선택)
  status app_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (item_id, applicant_id)                -- 매물당 1인 1지원 (수정은 upsert)
);

create index applications_item_id_status_idx on applications (item_id, status);
create index applications_applicant_id_idx on applications (applicant_id);

create type tx_status as enum ('paid', 'completed', 'noshow_settled', 'refunded');

create table transactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items (id) unique,
  application_id uuid not null references applications (id) unique,
  buyer_id uuid not null references profiles (id),
  seller_id uuid not null references profiles (id),
  amount int not null,                         -- 낙찰가 (offer_price)
  toss_payment_key text not null,
  status tx_status not null default 'paid',
  pickup_deadline timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index transactions_seller_id_idx on transactions (seller_id);
create index transactions_buyer_id_idx on transactions (buyer_id);
create index transactions_status_pickup_deadline_idx on transactions (status, pickup_deadline);

create table messages (
  id bigint generated always as identity primary key,
  tx_id uuid not null references transactions (id),
  sender_id uuid not null references profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

create index messages_tx_id_created_at_idx on messages (tx_id, created_at);

-- §2: "제시가 시작가 이상" — API에서도 검증하지만, 금액이 걸린 규칙이라 DB에서도 방어한다.
create function enforce_offer_price_floor() returns trigger as $$
declare
  v_start_price int;
begin
  select start_price into v_start_price from items where id = new.item_id;
  if v_start_price is null then
    raise exception 'item % not found', new.item_id;
  end if;
  if new.offer_price < v_start_price then
    raise exception 'offer_price (%) must be >= item start_price (%)', new.offer_price, v_start_price;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger applications_offer_price_floor
  before insert or update of offer_price, item_id on applications
  for each row execute function enforce_offer_price_floor();
