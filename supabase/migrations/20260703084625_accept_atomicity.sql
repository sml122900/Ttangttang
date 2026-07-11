-- §3 수락(낙찰)의 원자성.
--
-- 토스 빌링키 결제 실행은 외부 HTTP 호출이라 하나의 Postgres 트랜잭션에 넣을 수 없다.
-- 그래서 §3의 "1) DB 트랜잭션 / 2) 결제 실행"은 함수 두 개로 나뉜다:
--   accept_application()            — 1)의 조건부 이중 UPDATE. 판매자가 직접 호출(RLS 컨텍스트).
--   finalize_accepted_application() — 2) 결제 성공 후. 백엔드(서비스 롤)만 호출.
--   revert_failed_acceptance()      — 2) 결제 실패 후. 백엔드(서비스 롤)만 호출.
-- API 레이어의 "수락하기" 처리 순서: accept_application() 호출 → 성공 시 토스 결제 실행 →
--   성공하면 finalize_accepted_application(), 실패하면 revert_failed_acceptance().
--
-- 권한 참고: Supabase는 새 함수에 기본적으로 anon/authenticated/service_role 모두에게
-- EXECUTE를 부여한다(스키마 기본 권한). `revoke ... from public`만으로는 anon/authenticated
-- 각각에게 걸린 개별 grant가 지워지지 않으므로, 반드시 role 이름을 명시해서 revoke해야 한다.

-- ---------- 1) 조건부 이중 UPDATE (철회와의 레이스를 여기서 원자적으로 차단) ----------
create function accept_application(p_application_id uuid)
returns applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_seller_id uuid;
  v_app applications;
begin
  select item_id into v_item_id from applications where id = p_application_id;
  if v_item_id is null then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;

  select seller_id into v_seller_id from items where id = v_item_id;
  if v_seller_id is null then
    raise exception 'item % not found', v_item_id using errcode = 'P0002';
  end if;
  -- auth.uid()가 NULL인 호출(anon)에서도 반드시 걸리도록 NULL-안전 비교를 쓴다.
  -- (`<>`는 NULL과 비교하면 NULL이 되어 IF에서 false 취급 → 인가 체크가 통째로 우회된다.)
  if v_seller_id is distinct from auth.uid() then
    raise exception 'only the seller can accept an application' using errcode = '42501';
  end if;

  -- 철회와의 레이스를 원자적으로 차단: pending일 때만 accepted로.
  update applications
     set status = 'accepted'
   where id = p_application_id
     and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception '이 지원서는 방금 철회됐어요' using errcode = 'TT409';
  end if;

  -- 같은 매물에 대한 동시 수락(중복 낙찰)을 차단: live일 때만 awarded로.
  update items
     set status = 'awarded'
   where id = v_item_id
     and status = 'live';

  if not found then
    -- 둘 중 하나라도 0 rows면 여기서 예외 발생 → 함수 전체가 롤백된다 (앞선 applications UPDATE도 함께).
    raise exception '이 지원서는 방금 철회됐어요' using errcode = 'TT409';
  end if;

  return v_app;
end;
$$;

revoke all on function accept_application(uuid) from public, anon, authenticated;
grant execute on function accept_application(uuid) to authenticated;

-- ---------- 2) 결제 성공 ----------
-- 백엔드(service_role)만 호출한다. 클라이언트가 직접 부를 수 있으면 가짜 toss_payment_key로
-- 결제 없이 낙찰을 완료 처리할 수 있으므로 anon/authenticated에는 EXECUTE를 절대 주지 않는다.
create function finalize_accepted_application(
  p_application_id uuid,
  p_toss_payment_key text,
  p_pickup_deadline timestamptz
)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications;
  v_item items;
  v_tx transactions;
begin
  select * into v_app from applications where id = p_application_id for update;
  if not found then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;
  if v_app.status <> 'accepted' then
    raise exception 'application % is not in accepted state (status=%)', p_application_id, v_app.status
      using errcode = 'TT409';
  end if;

  select * into v_item from items where id = v_app.item_id for update;

  insert into transactions (item_id, application_id, buyer_id, seller_id, amount, toss_payment_key, pickup_deadline)
  values (v_item.id, v_app.id, v_app.applicant_id, v_item.seller_id, v_app.offer_price, p_toss_payment_key, p_pickup_deadline)
  returning * into v_tx;

  -- 나머지 pending 지원서 일괄 거절 (탈락자 푸시는 API 레이어에서 이 반환값 기준으로 발송)
  update applications
     set status = 'rejected'
   where item_id = v_item.id
     and status = 'pending';

  return v_tx;
end;
$$;

revoke all on function finalize_accepted_application(uuid, text, timestamptz) from public, anon, authenticated;

-- ---------- 2) 결제 실패 ----------
-- finalize와 동일한 이유로 service_role 전용.
create function revert_failed_acceptance(p_application_id uuid)
returns applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications;
begin
  update applications
     set status = 'payment_failed'
   where id = p_application_id
     and status = 'accepted'
  returning * into v_app;

  if not found then
    raise exception 'application % is not in accepted state, cannot revert', p_application_id
      using errcode = 'TT409';
  end if;

  update items
     set status = 'live'
   where id = v_app.item_id
     and status = 'awarded';

  return v_app;
end;
$$;

revoke all on function revert_failed_acceptance(uuid) from public, anon, authenticated;

-- ---------- 남용 감지: 최근 철회 이력 로그 ----------
-- profiles.withdraw_count(누적)만으로는 "30일 내 3회 초과"를 계산할 수 없어(시각 정보가 없다),
-- 철회 시각을 남기는 로그 테이블을 둔다. applications 테이블 자체는 건드리지 않는다.
create table application_withdrawals (
  id bigint generated always as identity primary key,
  applicant_id uuid not null references profiles (id),
  item_id uuid not null references items (id),
  withdrawn_at timestamptz not null default now()
);

create index application_withdrawals_applicant_withdrawn_at_idx
  on application_withdrawals (applicant_id, withdrawn_at);

alter table application_withdrawals enable row level security;
-- 클라이언트용 정책 없음 — 조회/기록은 아래 함수(SECURITY DEFINER)를 통해서만 이뤄진다.
revoke all on application_withdrawals from public, anon, authenticated;

-- §3: "30일 내 철회 3회 초과 시 7일간 지원 제한"
-- 최근 7일 내 철회 중, "그 철회 시점 기준 직전 30일간의 철회 횟수"가 3회를 넘겼던 게 있으면
-- (= 그 철회가 4번째 이상이었다면) 아직 7일 제한 기간 안에 있는 것으로 본다.
create function is_withdraw_restricted(p_applicant_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from application_withdrawals w
    where w.applicant_id = p_applicant_id
      and w.withdrawn_at > now() - interval '7 days'
      and (
        select count(*)
        from application_withdrawals w2
        where w2.applicant_id = p_applicant_id
          and w2.withdrawn_at <= w.withdrawn_at
          and w2.withdrawn_at > w.withdrawn_at - interval '30 days'
      ) > 3
  );
$$;

revoke all on function is_withdraw_restricted(uuid) from public, anon, authenticated;
grant execute on function is_withdraw_restricted(uuid) to authenticated;

-- ---------- [철회] pending일 때만 withdrawn으로, 남용 감지 로그 남기고 지원 제한 판정 ----------
create function withdraw_application(p_application_id uuid)
returns applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app applications;
begin
  update applications
     set status = 'withdrawn'
   where id = p_application_id
     and applicant_id = auth.uid()
     and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception '지원을 철회할 수 없어요 (이미 처리된 지원서예요)' using errcode = 'TT409';
  end if;

  update profiles set withdraw_count = withdraw_count + 1 where id = auth.uid();

  insert into application_withdrawals (applicant_id, item_id, withdrawn_at)
  values (auth.uid(), v_app.item_id, now());

  return v_app;
end;
$$;

revoke all on function withdraw_application(uuid) from public, anon, authenticated;
grant execute on function withdraw_application(uuid) to authenticated;

-- ---------- 지원 제한을 실제로 강제한다 ----------
-- rls_policies.sql이 만든 최초 버전의 applications_insert_own을 교체한다: is_withdraw_restricted()가
-- 이 시점(이 파일)에서야 정의되므로, 정책 자체는 여기서 다시 만들어야 참조할 수 있다.
drop policy "applications_insert_own" on applications;

create policy "applications_insert_own" on applications
  for insert
  with check (
    applicant_id = auth.uid()
    and not is_withdraw_restricted(applicant_id)
  );
