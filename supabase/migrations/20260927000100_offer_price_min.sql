-- §0 규칙 2: 제시가는 시작가 이상. 이 규칙은 init_schema의 applications_offer_price_floor 트리거가
-- 이미 DB에서 강제하고 있다. 여기서는 그 함수가 던지는 예외에 SQLSTATE를 붙인다 — 기존엔 코드 없이
-- P0001(raise_exception)로 떨어져 클라이언트가 "제약 위반"과 "알 수 없는 서버 오류"를 구분할 수 없었다.
--   23514 (check_violation) + 사용자에게 그대로 보여줄 수 있는 한국어 문구.
create or replace function enforce_offer_price_floor() returns trigger as $$
declare
  v_start_price int;
begin
  select start_price into v_start_price from items where id = new.item_id;
  if v_start_price is null then
    raise exception 'item % not found', new.item_id using errcode = 'P0002';
  end if;
  if new.offer_price < v_start_price then
    raise exception '제시가는 시작가(%원) 이상이어야 해요', v_start_price using errcode = '23514';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;
