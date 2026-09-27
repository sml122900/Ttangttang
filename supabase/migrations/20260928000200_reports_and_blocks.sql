-- 3단계 — 신고·차단 (플레이스토어 UGC 정책 필수 항목, docs/launch-audit.md §3).
--
-- 범위 판단(docs/decisions.md 3단계에 근거 기록): 차단의 "상호 비노출"은 매물 피드 노출과
-- 새 지원서 제출을 막는다. 이미 결제까지 끝난 거래의 채팅은 막지 않는다 — 돈이 오간 뒤에는
-- 수령 조율이 우선이라, 차단이 픽업 약속을 무산시키게 두지 않는다.

-- ---------- 신고 ----------
create type report_target_type as enum ('item', 'application', 'message', 'user');

create table reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references profiles (id),
  target_type report_target_type not null,
  target_id text not null,       -- items.id / applications.id / messages.id / 대상 유저 profiles.id
  reason text not null,
  detail text,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now()
);

alter table reports enable row level security;

-- 접수만 가능 — 처리 상태 조회/변경은 Supabase 대시보드에서 service_role로 한다(운영자 UI 없음,
-- MVP 범위). 신고자에게도 조회 정책을 주지 않는다: 본인 신고 목록 확인은 이번 범위 밖.
create policy "reports_insert_own" on reports
  for insert
  with check (reporter_id = auth.uid());

-- ---------- 차단 ----------
create table blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  blocked_nickname text not null,  -- 차단 시점 닉네임 스냅샷 — 설정 화면 차단 목록 표시용.
                                    -- 상대가 나중에 탈퇴해도(닉네임이 "탈퇴한 사용자"로 바뀌어도)
                                    -- 내가 "누구를" 차단했는지 기록은 그대로 남는 편이 맞다.
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table blocks enable row level security;

create policy "blocks_select_own" on blocks
  for select
  using (blocker_id = auth.uid());

-- insert/delete는 클라이언트 정책을 두지 않는다 — block_user()/unblock_user()로만 가능하게 해서
-- blocked_nickname이 항상 서버가 조회한 실제 닉네임이 되도록 강제한다(클라이언트가 임의 문자열을
-- 넣을 수 없게).

create function block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
begin
  if auth.uid() is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;
  if p_blocked_id = auth.uid() then
    raise exception '본인은 차단할 수 없어요' using errcode = '22023';
  end if;

  select nickname into v_nickname from profiles where id = p_blocked_id;
  if v_nickname is null then
    raise exception 'user % not found', p_blocked_id using errcode = 'P0002';
  end if;

  insert into blocks (blocker_id, blocked_id, blocked_nickname)
  values (auth.uid(), p_blocked_id, v_nickname)
  on conflict (blocker_id, blocked_id) do update set blocked_nickname = excluded.blocked_nickname;
end;
$$;

revoke all on function block_user(uuid) from public, anon, authenticated;
grant execute on function block_user(uuid) to authenticated;

create function unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from blocks where blocker_id = auth.uid() and blocked_id = p_blocked_id;
end;
$$;

revoke all on function unblock_user(uuid) from public, anon, authenticated;
grant execute on function unblock_user(uuid) to authenticated;

-- ---------- 차단 강제: 매물 피드 ----------
-- rls_policies.sql의 원래 정책(using (true) — 완전 공개)을 교체한다. anon은 blocks 자체를
-- 신경 쓸 이유가 없어(로그인 안 한 사람은 아무도 차단하지 않았다) auth.uid() is null이면
-- 그냥 통과시킨다.
drop policy "items_select_public" on items;

create policy "items_select_public" on items
  for select
  using (
    auth.uid() is null
    or not exists (
      select 1 from blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = items.seller_id)
         or (b.blocker_id = items.seller_id and b.blocked_id = auth.uid())
    )
  );

-- ---------- 차단 강제: 새 지원서 ----------
-- accept_atomicity.sql이 지원 제한(is_withdraw_restricted)을 추가하며 이미 한 번 교체한
-- 정책을 다시 교체한다 — 두 조건(철회 남용 + 차단)을 모두 만족해야 지원할 수 있다.
drop policy "applications_insert_own" on applications;

create policy "applications_insert_own" on applications
  for insert
  with check (
    applicant_id = auth.uid()
    and not is_withdraw_restricted(applicant_id)
    and not exists (
      select 1 from blocks b
      join items i on i.id = applications.item_id
      where (b.blocker_id = auth.uid() and b.blocked_id = i.seller_id)
         or (b.blocker_id = i.seller_id and b.blocked_id = auth.uid())
    )
  );
