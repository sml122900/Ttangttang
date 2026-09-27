-- 4단계 — 등록 화면 수령시한 입력. accept 시 하드코딩됐던 24시간(apps/web/app/api/
-- applications/[id]/accept/route.ts) 대신 판매자가 정한 값을 쓴다.
alter table items
  add column pickup_deadline_hours int not null default 24
  check (pickup_deadline_hours in (24, 48, 72));

-- ---------- 매물 수정·삭제 ----------
-- items_update_own_live_or_cancel(rls_policies.sql)이 이미 "내 live 매물, live/cancelled로만
-- 전이"를 허용하고 있어 제목·설명·사진·슬롯·수령시한 수정은 별도 정책 없이도 된다.
-- 시작가만은 §0 규칙 1(고정 3택)의 정신을 지키려 등록 후 변경을 막는다 — 지원자가 이미 그
-- 시작가를 보고 지원했을 수 있어, 나중에 바뀌면 §0 규칙 6(공개 정보 신뢰)이 깨진다.
create function prevent_start_price_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.start_price <> old.start_price then
    raise exception '시작가는 등록 후 바꿀 수 없어요' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger items_start_price_immutable
  before update on items
  for each row execute function prevent_start_price_change();

-- 매물을 취소(삭제)하면 대기 중이던 지원서도 자동으로 거절 처리한다 — 응답 없이 방치되는
-- 지원서가 없게. 알림 발송은 4-6단계(notifications) 트리거가 이 UPDATE를 그대로 잡아낸다.
create function reject_pending_applications_on_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    update applications
       set status = 'rejected'
     where item_id = new.id
       and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger items_reject_applications_on_cancel
  after update on items
  for each row execute function reject_pending_applications_on_cancel();
