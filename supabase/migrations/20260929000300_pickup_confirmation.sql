-- 4단계 — 수령 확인(구매자 확인 + 판매자 확인 이중 체크) + 수령률/거래횟수 재계산.
-- PROJECT.md §3: "수령 완료는 구매자 확인 + 판매자 확인 이중 체크."

alter table transactions
  add column buyer_confirmed_at timestamptz,
  add column seller_confirmed_at timestamptz;

-- profiles.receive_rate/trade_count는 증분(+1, +1%) 대신 transactions에서 매번 다시 계산한다 —
-- 증분 방식은 재시도·동시 실행에서 어긋나기 쉽고, 다시 계산하는 쪽이 항상 정답과 같다
-- (거래 건수가 개인당 많지 않은 MVP 규모에서는 비용도 무시할 만하다).
-- receive_rate는 "구매자로서 약속을 지켰는가"를 재는 지표라 buyer_id 기준으로만 계산한다
-- (완료 / (완료+노쇼정산)).
create function recompute_receive_rate(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles p
     set receive_rate = coalesce(
       (
         select round(100.0 * count(*) filter (where t.status = 'completed')
                       / nullif(count(*) filter (where t.status in ('completed', 'noshow_settled')), 0))
         from transactions t
         where t.buyer_id = p_profile_id
       ),
       100
     )
   where p.id = p_profile_id;
$$;

revoke all on function recompute_receive_rate(uuid) from public, anon, authenticated;

-- trade_count는 완료된(정상 수령) 거래만 센다 — 구매자·판매자 양쪽 다 대상.
create function recompute_trade_count(p_profile_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles p
     set trade_count = (
       select count(*) from transactions t
       where (t.buyer_id = p_profile_id or t.seller_id = p_profile_id)
         and t.status = 'completed'
     )
   where p.id = p_profile_id;
$$;

revoke all on function recompute_trade_count(uuid) from public, anon, authenticated;

-- 당사자(구매자 또는 판매자) 중 한쪽이 부른다. 둘 다 확인하면 그 순간 completed로 전이하고
-- 양쪽의 trade_count/receive_rate(구매자만)를 갱신한다.
create function confirm_pickup(p_transaction_id uuid)
returns transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx transactions;
begin
  select * into v_tx from transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'transaction % not found', p_transaction_id using errcode = 'P0002';
  end if;
  if v_tx.status <> 'paid' then
    raise exception '이미 처리된 거래예요' using errcode = 'TT430';
  end if;

  if auth.uid() = v_tx.buyer_id then
    update transactions set buyer_confirmed_at = now() where id = p_transaction_id returning * into v_tx;
  elsif auth.uid() = v_tx.seller_id then
    update transactions set seller_confirmed_at = now() where id = p_transaction_id returning * into v_tx;
  else
    raise exception 'only a party to this transaction can confirm' using errcode = '42501';
  end if;

  if v_tx.buyer_confirmed_at is not null and v_tx.seller_confirmed_at is not null then
    update transactions
       set status = 'completed', completed_at = now()
     where id = p_transaction_id
    returning * into v_tx;

    perform recompute_trade_count(v_tx.buyer_id);
    perform recompute_trade_count(v_tx.seller_id);
    perform recompute_receive_rate(v_tx.buyer_id);
  end if;

  return v_tx;
end;
$$;

revoke all on function confirm_pickup(uuid) from public, anon, authenticated;
grant execute on function confirm_pickup(uuid) to authenticated;
