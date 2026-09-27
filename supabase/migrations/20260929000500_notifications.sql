-- 4단계 — 푸시 알림 5종(지원 도착·낙찰·거절·수령임박·노쇼 정산). PROJECT.md §1 "Expo
-- Notifications" / §3.
--
-- 설계: apps/web을 거치지 않는다. 지원서 삽입/상태 변경이 전부 모바일에서 Supabase 클라이언트로
-- 직접 일어나기 때문에(별도 API 레이어 없음), DB 트리거로 notifications 아웃박스에 적재하고,
-- pg_cron + pg_net으로 Postgres가 직접 Expo 푸시 API(https://exp.host/--/api/v2/push/send)를
-- 호출한다 — apps/web/api/webhooks/payment-incident(Discord 릴레이)와 같은 "DB가 직접 외부
-- HTTP를 부른다"는 패턴을 재사용한 것. net.http_post는 비동기 발사-후-망각이라 Expo가 실제로
-- 수신했는지 확인/재시도하지 않는다 — best-effort로 문서화해둔다.

create table push_tokens (
  profile_id uuid primary key references profiles (id) on delete cascade,
  expo_push_token text not null,
  updated_at timestamptz not null default now()
);

alter table push_tokens enable row level security;

create policy "push_tokens_insert_own" on push_tokens
  for insert
  with check (profile_id = auth.uid());

create policy "push_tokens_update_own" on push_tokens
  for update
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create table notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references profiles (id),
  kind text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_unsent_idx on notifications (created_at) where sent_at is null;

alter table notifications enable row level security;
revoke all on notifications from public, anon, authenticated;

create function enqueue_notification(p_recipient_id uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}')
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (recipient_id, kind, title, body, data)
  values (p_recipient_id, p_kind, p_title, p_body, p_data);
$$;

revoke all on function enqueue_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ---------- 1) 지원 도착 ----------
create function notify_application_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller_id uuid;
  v_item_title text;
begin
  select seller_id, title into v_seller_id, v_item_title from items where id = new.item_id;
  perform enqueue_notification(
    v_seller_id,
    'application_received',
    '새 지원서가 도착했어요',
    format('%s · %s원 제시', v_item_title, new.offer_price::text),
    jsonb_build_object('itemId', new.item_id, 'applicationId', new.id)
  );
  return new;
end;
$$;

create trigger applications_notify_received
  after insert on applications
  for each row execute function notify_application_received();

-- ---------- 2) 거절 ---------- (accept 시 일괄 거절 / 매물 취소 시 일괄 거절 둘 다 여기서 잡힌다)
create function notify_application_rejected()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    perform enqueue_notification(
      new.applicant_id,
      'application_rejected',
      '이번엔 다른 이웃에게 낙찰됐어요',
      '다음 기회에 다시 지원해보세요',
      jsonb_build_object('itemId', new.item_id, 'applicationId', new.id)
    );
  end if;
  return new;
end;
$$;

create trigger applications_notify_rejected
  after update on applications
  for each row execute function notify_application_rejected();

-- ---------- 3) 낙찰(구매자) + 낙찰 확정 안내(판매자) ----------
-- finalize_accepted_application(accept_atomicity.sql)을 교체해 알림 발송을 추가한다.
-- 원자성 로직 자체는 그대로다.
create or replace function finalize_accepted_application(
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

  perform enqueue_notification(
    v_tx.buyer_id,
    'awarded',
    '땅땅! 낙찰됐어요',
    format('%s · %s원. 채팅으로 수령 시간을 확정해주세요', v_item.title, v_tx.amount::text),
    jsonb_build_object('transactionId', v_tx.id)
  );
  perform enqueue_notification(
    v_tx.seller_id,
    'award_confirmed',
    '낙찰이 확정됐어요',
    format('%s · %s원에 결제까지 끝났어요', v_item.title, v_tx.amount::text),
    jsonb_build_object('transactionId', v_tx.id)
  );

  -- 나머지 pending 지원서 일괄 거절 (탈락자 알림은 위 notify_application_rejected 트리거가 발송)
  update applications
     set status = 'rejected'
   where item_id = v_item.id
     and status = 'pending';

  return v_tx;
end;
$$;

-- ---------- 4) 수령 임박 ----------
alter table transactions
  add column pickup_reminder_sent_at timestamptz;

create function send_pickup_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    update transactions t
       set pickup_reminder_sent_at = now()
      from items i
     where t.status = 'paid'
       and t.pickup_reminder_sent_at is null
       and t.pickup_deadline between now() and now() + interval '1 hour'
       and i.id = t.item_id
    returning t.id, t.buyer_id, i.title
  loop
    perform enqueue_notification(
      v_row.buyer_id,
      'pickup_reminder',
      '수령 시간이 얼마 안 남았어요',
      format('%s · 약속 시간을 넘기면 노쇼로 결제금 전액이 위약금으로 처리돼요', v_row.title),
      jsonb_build_object('transactionId', v_row.id)
    );
  end loop;
end;
$$;

-- ---------- 5) 노쇼 정산 (양측 알림 포함하도록 교체) ----------
create or replace function settle_noshow_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    update transactions t
       set status = 'noshow_settled'
      from items i
     where t.status = 'paid'
       and t.pickup_deadline < now()
       and i.id = t.item_id
    returning t.id, t.buyer_id, t.seller_id, i.title
  loop
    perform recompute_receive_rate(v_row.buyer_id);
    perform enqueue_notification(
      v_row.buyer_id,
      'noshow_buyer',
      '노쇼로 정산됐어요',
      format('%s · 약속 시간 내 수령하지 않아 결제금이 위약금으로 정산됐어요', v_row.title),
      jsonb_build_object('transactionId', v_row.id)
    );
    perform enqueue_notification(
      v_row.seller_id,
      'noshow_seller',
      '노쇼 위약금이 정산됐어요',
      format('%s · 구매자가 수령하지 않아 결제금 전액이 위약금으로 지급돼요', v_row.title),
      jsonb_build_object('transactionId', v_row.id)
    );
  end loop;
end;
$$;

-- ---------- 발송 ----------
-- net.http_post는 비동기 발사-후-망각이다 — Expo가 실제로 수신했는지 확인/재시도하지 않는다
-- (best-effort). 토큰이 아예 없는 수신자는 "보낼 곳이 없음"으로 처리하고 넘어간다.
create function send_pending_notifications()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  for v_row in
    select n.id, n.title, n.body, n.data, pt.expo_push_token
    from notifications n
    join push_tokens pt on pt.profile_id = n.recipient_id
    where n.sent_at is null
    order by n.id
    limit 200
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := jsonb_build_object('to', v_row.expo_push_token, 'title', v_row.title, 'body', v_row.body, 'data', v_row.data)
    );
    update notifications set sent_at = now() where id = v_row.id;
  end loop;

  update notifications n
     set sent_at = now()
   where n.sent_at is null
     and not exists (select 1 from push_tokens pt where pt.profile_id = n.recipient_id);
end;
$$;

revoke all on function send_pickup_reminders() from public, anon, authenticated;
revoke all on function send_pending_notifications() from public, anon, authenticated;

-- ---------- 스케줄 (10분 주기 — §3 노쇼 정산 주기에 맞춰 하나로 묶는다) ----------
create function run_scheduled_jobs()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform send_pickup_reminders();
  perform settle_noshow_transactions();
  perform send_pending_notifications();
end;
$$;

revoke all on function run_scheduled_jobs() from public, anon, authenticated;

select cron.schedule('ttangttang-scheduled-jobs', '*/10 * * * *', 'select run_scheduled_jobs()');
