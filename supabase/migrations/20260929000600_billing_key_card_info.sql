-- 4단계 — settings/payment 카드 관리. billing_keys는 클라이언트 정책이 전혀 없는 테이블이라
-- (rls_policies.sql) "등록됨/미등록"만 has_billing_key()로 확인할 수 있었다. 카드사·마스킹된
-- 번호를 보여주려면 발급 시점에 그 정보를 같이 저장해두고, 안전한 접근자를 통해서만 꺼내야 한다
-- (billing_key 원문은 여전히 어떤 함수에서도 반환하지 않는다).
alter table billing_keys
  add column card_company text,
  add column card_number_masked text;

create function get_my_card_info()
returns table (card_company text, card_number_masked text)
language sql
security definer
set search_path = public
stable
as $$
  select bk.card_company, bk.card_number_masked
  from billing_keys bk
  where bk.profile_id = auth.uid();
$$;

revoke all on function get_my_card_info() from public, anon, authenticated;
grant execute on function get_my_card_info() to authenticated;

create function delete_billing_key()
returns void
language sql
security definer
set search_path = public
as $$
  delete from billing_keys where profile_id = auth.uid();
$$;

revoke all on function delete_billing_key() from public, anon, authenticated;
grant execute on function delete_billing_key() to authenticated;
