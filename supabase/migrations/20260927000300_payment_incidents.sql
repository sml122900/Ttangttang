-- §4 P1/P2: 결제 체인에서 "돈과 DB 상태가 어긋났을 수 있는" 경우를 운영자가 사후 대조할 수 있게
-- 남기는 기록. accept API(service_role)만 쓴다 — 클라이언트 정책 없음.
--   charge_unknown_not_found   — 타임아웃/예외 후 orderId 조회 결과 결제 없음 → 되돌림. 늦게 승인될 가능성 대비.
--   charge_unknown_unresolved  — 타임아웃/예외 후 조회도 실패 → 되돌림. 토스 대시보드 대조 필요.
--   finalize_failed_canceled   — 결제 성공 후 낙찰 확정 실패 → 결제 취소 성공 → 되돌림.
--   finalize_failed_cancel_failed — 결제 성공, 확정 실패, 취소도 실패 → 상태 유지(accepted/awarded). 수동 처리 필요.
--   revert_failed              — revert_failed_acceptance() 자체가 실패.
create table payment_incidents (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications (id),
  kind text not null,
  payment_key text,
  detail text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index payment_incidents_unresolved_idx on payment_incidents (created_at) where resolved_at is null;

alter table payment_incidents enable row level security;
revoke all on payment_incidents from public, anon, authenticated;
