-- 버그 수정: 20260928000200_reports_and_blocks.sql의 items_select_public/
-- applications_insert_own 정책이 blocks 테이블을 직접 서브쿼리로 참조했는데, 그 서브쿼리도
-- blocks 자신의 RLS(blocks_select_own: blocker_id = auth.uid())를 그대로 적용받는다.
-- 그래서 "bob이 alice를 차단"했을 때, alice가 items를 조회하면 alice의 auth.uid() 기준으로
-- blocks가 필터링되어 blocker_id=bob인 그 행 자체가 안 보여 차단이 비대칭으로만 걸렸다
-- (bob→alice는 막히지만 alice→bob은 안 막힘). 같은 파일의 is_withdraw_restricted()가
-- SECURITY DEFINER인 것과 동일한 이유로, 여기도 SECURITY DEFINER 함수로 감싸 호출자의 RLS를
-- 우회하고 항상 "실제로 차단 관계가 있는지"만 본다 (검증 스크립트 scripts/verify-stage3.mjs
-- 4단계에서 이 비대칭을 실제로 잡아냈다).
create function is_blocked_pair(p_a uuid, p_b uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

revoke all on function is_blocked_pair(uuid, uuid) from public, anon, authenticated;
grant execute on function is_blocked_pair(uuid, uuid) to authenticated;

drop policy "items_select_public" on items;

create policy "items_select_public" on items
  for select
  using (
    auth.uid() is null
    or not is_blocked_pair(auth.uid(), items.seller_id)
  );

-- applications_insert_own도 같은 함정이 하나 더 있다: "item_id로 seller_id를 찾는" 서브쿼리를
-- 정책 안에 그대로 두면 그 서브쿼리도 items_select_public의 적용을 받는다. 지원자가 이미
-- 차단(따라서 그 매물이 안 보이는) 상태에서 예전에 알던 item_id로 직접 insert를 시도하면,
-- seller_id 조회 자체가 NULL이 되어 is_blocked_pair(applicant, NULL)이 false를 반환하며
-- 차단 검사를 그대로 통과해버린다. items 조회까지 SECURITY DEFINER 안에서 해서 RLS를
-- 완전히 우회해야 한다.
create function is_applicant_blocked_from_item(p_applicant_id uuid, p_item_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select is_blocked_pair(p_applicant_id, i.seller_id) from items i where i.id = p_item_id),
    false
  );
$$;

revoke all on function is_applicant_blocked_from_item(uuid, uuid) from public, anon, authenticated;
grant execute on function is_applicant_blocked_from_item(uuid, uuid) to authenticated;

drop policy "applications_insert_own" on applications;

create policy "applications_insert_own" on applications
  for insert
  with check (
    applicant_id = auth.uid()
    and not is_withdraw_restricted(applicant_id)
    and not is_applicant_blocked_from_item(applicant_id, item_id)
  );
