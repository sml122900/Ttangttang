-- §4 P5: 카드 등록 대상(customerKey)을 로그인 사용자에 묶는다.
-- 이전에는 /pay/billing-auth?customerKey=<uuid>를 누구나 열 수 있어서, 공개된 seller_id 등으로
-- 남의 UUID를 넣으면 그 사람의 billing_keys를 내 카드로 덮어쓸 수 있었다. 또 clientRedirect를
-- 검증 없이 그대로 따라가는 오픈 리다이렉트였다.
--
-- 이제는: 앱이 access token으로 POST /api/billing/session → 서버가 이 테이블에 1회용 세션을 만든다
-- (profile_id = 토큰 주인, client_redirect = 허용 스킴 검증 통과한 값). 웹 페이지/콜백은 세션 id만
-- 들고 다니고, 콜백은 세션을 원자적으로 소비하면서 토스가 돌려준 customerKey가 세션 주인과 같은지 확인한다.
create table billing_auth_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  client_redirect text not null,
  expires_at timestamptz not null default now() + interval '15 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table billing_auth_sessions enable row level security;
revoke all on billing_auth_sessions from public, anon, authenticated;
