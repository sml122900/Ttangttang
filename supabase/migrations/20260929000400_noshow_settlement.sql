-- 4단계 — 노쇼 정산. PROJECT.md §3: "status='paid' AND pickup_deadline < now() → 'noshow_settled'".
-- 스케줄(10분 주기)은 20260929000500_notifications.sql의 run_scheduled_jobs()가 pg_cron으로
-- 건다 — 알림 발송(양측 푸시)과 같은 주기로 한 번에 묶는 게 크론 작업 하나로 충분해서다.
create function settle_noshow_transactions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_id uuid;
begin
  for v_buyer_id in
    update transactions
       set status = 'noshow_settled'
     where status = 'paid'
       and pickup_deadline < now()
    returning buyer_id
  loop
    perform recompute_receive_rate(v_buyer_id);
  end loop;
end;
$$;

revoke all on function settle_noshow_transactions() from public, anon, authenticated;
