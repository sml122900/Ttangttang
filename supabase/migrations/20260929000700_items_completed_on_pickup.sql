-- 버그 수정: item_status enum에 'completed'가 있는데도 어떤 코드 경로도 items.status를
-- 그 값으로 바꾸지 않았다 — accept_application()이 live→awarded로 바꾼 뒤로는 아무도
-- awarded→completed 전이를 하지 않아, 거래가 끝나도 매물은 영원히 'awarded'로 남았다.
-- confirm_pickup()이 transactions를 completed로 바꾸는 바로 그 시점에 items도 같이 바꾼다.
create or replace function confirm_pickup(p_transaction_id uuid)
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

    update items set status = 'completed' where id = v_tx.item_id;

    perform recompute_trade_count(v_tx.buyer_id);
    perform recompute_trade_count(v_tx.seller_id);
    perform recompute_receive_rate(v_tx.buyer_id);
  end if;

  return v_tx;
end;
$$;
