-- §4 P8: accept_application()이 "지원서 철회"와 "매물 이미 낙찰/마감"을 둘 다 TT409
-- ("방금 철회됐어요")로 보고해서, 응답 유실 후 재시도한 판매자에게 틀린 문구가 나갔다.
-- 원자성 로직(조건부 이중 UPDATE)은 그대로 두고, 0 rows일 때의 에러 코드만 나눈다.
--   TT409 — 지원서가 철회됨
--   TT410 — 매물이 이미 낙찰됐거나 live가 아님
--   TT411 — 지원서가 이미 처리됨(accepted/rejected/payment_failed)
create or replace function accept_application(p_application_id uuid)
returns applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid;
  v_seller_id uuid;
  v_status app_status;
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
    -- 판정은 이미 위의 조건부 UPDATE가 끝냈다. 여기서는 어떤 문구를 보여줄지만 고른다.
    select status into v_status from applications where id = p_application_id;
    if v_status = 'withdrawn' then
      raise exception '이 지원서는 방금 철회됐어요' using errcode = 'TT409';
    end if;
    raise exception '이미 처리된 지원서예요' using errcode = 'TT411';
  end if;

  -- 같은 매물에 대한 동시 수락(중복 낙찰)을 차단: live일 때만 awarded로.
  update items
     set status = 'awarded'
   where id = v_item_id
     and status = 'live';

  if not found then
    -- 예외 → 함수 전체 롤백 (앞선 applications UPDATE도 함께).
    raise exception '이미 낙찰됐거나 마감된 매물이에요' using errcode = 'TT410';
  end if;

  return v_app;
end;
$$;
