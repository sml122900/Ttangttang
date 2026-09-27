-- 3단계 A1 — 익명화 소프트 삭제 (docs/decisions.md 2026-09-27 사용자 결정).
--
-- profiles.id는 auth.users(id)를 on delete cascade로 참조한다. auth.users를 물리적으로
-- 삭제하면 그 cascade가 profiles까지 지우는데, items/applications/transactions/messages가
-- profiles(id)를 (cascade 없이) 참조하고 있어 거래 이력이 하나라도 있으면 그 cascade가
-- FK 위반으로 실패한다 — "거래·메시지는 보존"과 "auth.users 삭제"를 동시에 만족시키려면
-- 물리적 DELETE가 아니라 Supabase Auth의 소프트 삭제(admin.deleteUser(id, true))를 써야 한다.
-- 소프트 삭제는 로그인 수단(이메일/카카오 identity)을 지우고 세션을 무효화하지만 행 자체는
-- 남겨 FK를 깨지 않는다 — apps/web/app/api/account/delete/route.ts에서 이 함수 다음에 호출한다.
--
-- 이 함수가 하는 일(사용자 스코프, auth.uid() 기준):
--   1) 진행 중(paid, 아직 완료/노쇼정산 전) 거래가 있으면 탈퇴를 막는다 — 돈이 오간 거래를
--      한쪽이 사라진 채로 방치할 수 없다(수령 확인·노쇼 정산이 끝나야 함).
--   2) 판매 중(live)인 내 매물은 취소 처리한다 — 더 이상 응대할 수 없으니까.
--   3) billing_keys를 물리적으로 삭제한다(결제 자격증명은 원문 그대로 남겨둘 이유가 없다).
--   4) profiles는 행을 유지하되 nickname="탈퇴한 사용자", neighborhood=""로 비운다 —
--      거래 상대 화면(applicants/chat/trades)은 profiles를 그대로 조인하므로 즉시 반영된다.
create function delete_own_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_active_count int;
begin
  if v_uid is null then
    raise exception 'must be authenticated' using errcode = '42501';
  end if;

  select count(*) into v_active_count
  from transactions
  where (buyer_id = v_uid or seller_id = v_uid)
    and status = 'paid';
  if v_active_count > 0 then
    raise exception '진행 중인 거래가 있어 탈퇴할 수 없어요' using errcode = 'TT420';
  end if;

  update items
     set status = 'cancelled'
   where seller_id = v_uid
     and status = 'live';

  delete from billing_keys where profile_id = v_uid;

  update profiles
     set nickname = '탈퇴한 사용자',
         neighborhood = ''
   where id = v_uid;
end;
$$;

revoke all on function delete_own_account() from public, anon, authenticated;
grant execute on function delete_own_account() to authenticated;

-- ---------- 웹 삭제 요청 (플레이스토어 정책 — 앱 밖에서도 삭제를 요청할 수 있어야 함) ----------
-- 로그인 없이 apps/web/app/account/delete 페이지의 폼으로 접수된다(카카오 웹 로그인이 없어
-- 자동 처리 대신 요청 접수 + 수동 처리 방식 — docs/decisions.md 3단계). service_role 전용.
create table account_deletion_requests (
  id bigint generated always as identity primary key,
  contact text not null,   -- 사용자가 입력한 확인용 식별자(가입 닉네임/연락처 등, 자유 텍스트)
  note text,
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table account_deletion_requests enable row level security;
revoke all on account_deletion_requests from public, anon, authenticated;
