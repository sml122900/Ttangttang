-- RLS 정책. §0 규칙 6 (지원자 정보는 판매자에게만) · §2 (applications: 본인 것 + 자기 매물의
-- 지원서만 읽기) · §3 (수락=낙찰 전이는 오직 accept_application() RPC를 통해서만 일어난다)
-- 를 행 단위로 강제한다.

alter table profiles enable row level security;
alter table billing_keys enable row level security;
alter table items enable row level security;
alter table applications enable row level security;
alter table transactions enable row level security;
alter table messages enable row level security;

-- ---------- billing_keys ----------
-- 클라이언트용 정책을 하나도 만들지 않는다 — RLS enable + 정책 0개 = anon/authenticated는
-- 어떤 행도 볼 수도 쓸 수도 없다. Supabase는 새 테이블에 기본적으로 anon/authenticated에게도
-- 테이블 권한(GRANT)을 주므로, RLS만 믿지 않고 권한 자체도 명시적으로 걷어낸다.
revoke all on billing_keys from public, anon, authenticated;

-- 클라이언트가 "카드 등록이 되어 있는지"만 확인할 수 있는 유일한 통로. billing_key 원문은
-- 절대 반환하지 않는다 — 지원서 작성 화면에서 "카드 등록" 단계를 건너뛸지 판단하는 데만 쓴다.
create function has_billing_key()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from billing_keys where profile_id = auth.uid());
$$;

revoke all on function has_billing_key() from public, anon, authenticated;
grant execute on function has_billing_key() to authenticated;

-- ---------- profiles ----------
-- 판매자가 지원자를 보거나 거래 상대를 보는 경우는 아래 public_profile_for_counterparty 뷰로만 노출한다
-- (닉네임·동네·수령률·거래횟수만). 결제 자격증명(billing_key)은 애초에 이 테이블에 없다 — billing_keys 참고.
create policy "profiles_select_self" on profiles
  for select
  using (id = auth.uid());

create policy "profiles_insert_self" on profiles
  for insert
  with check (id = auth.uid());

create policy "profiles_update_self" on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------- items ----------
-- 매물 자체(제목/설명/시작가/사진/동네)는 §0 규칙 6에 따라 공개 정보 — 피드/공유랜딩에서 누구나 조회.
create policy "items_select_public" on items
  for select
  using (true);

create policy "items_insert_own" on items
  for insert
  with check (seller_id = auth.uid());

-- 클라이언트가 직접 할 수 있는 건 '내 live 매물 취소'뿐이다. live->awarded 전이는
-- accept_application() (SECURITY DEFINER, postgres 소유 → RLS 우회)로만 일어난다.
create policy "items_update_own_live_or_cancel" on items
  for update
  using (seller_id = auth.uid() and status = 'live')
  with check (seller_id = auth.uid() and status in ('live', 'cancelled'));

-- ---------- applications ----------
-- 본인 것 + 자기 매물의 지원서만 읽기 가능 (§2)
create policy "applications_select_own_or_seller" on applications
  for select
  using (
    applicant_id = auth.uid()
    or exists (
      select 1 from items i
      where i.id = applications.item_id
        and i.seller_id = auth.uid()
    )
  );

create policy "applications_insert_own" on applications
  for insert
  with check (applicant_id = auth.uid());

-- 지원자는 자기 pending 지원서를 수정(재지원=upsert)하거나 철회(withdrawn)할 수 있을 뿐,
-- accepted로 전이할 수 없다 — 그건 판매자 쪽에서 accept_application() RPC로만 일어난다.
-- (판매자에게는 applications에 대한 UPDATE 권한 자체를 주지 않는다.)
create policy "applications_update_own_pending" on applications
  for update
  using (applicant_id = auth.uid() and status = 'pending')
  with check (applicant_id = auth.uid() and status in ('pending', 'withdrawn'));

-- ---------- transactions ----------
-- 결제/정산 결과는 조회만 가능. 생성·갱신은 SECURITY DEFINER 함수와 service_role(노쇼 cron)만 수행한다.
create policy "transactions_select_party" on transactions
  for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- ---------- messages ----------
create policy "messages_select_party" on messages
  for select
  using (
    exists (
      select 1 from transactions t
      where t.id = messages.tx_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

create policy "messages_insert_party" on messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from transactions t
      where t.id = messages.tx_id
        and (t.buyer_id = auth.uid() or t.seller_id = auth.uid())
    )
  );

-- ---------- profiles의 안전한 부분집합만 노출하는 뷰 ----------
-- security_invoker 기본값(off)이라 뷰 소유자(postgres, RLS 우회) 권한으로 실행되지만,
-- auth.uid()로 관계를 직접 재검증하므로 "내 지원자" · "내 거래 상대"가 아닌 타인은 여전히 볼 수 없다.
-- select 목록에 billing_key를 절대 포함하지 않는 것이 이 뷰의 유일한 존재 이유다.
create view public_profile_for_counterparty as
select
  p.id,
  p.nickname,
  p.neighborhood,
  p.receive_rate,
  p.trade_count
from profiles p
where p.id = auth.uid()
   or exists (
     select 1
     from applications a
     join items i on i.id = a.item_id
     where a.applicant_id = p.id
       and i.seller_id = auth.uid()
   )
   or exists (
     select 1 from transactions t
     where (t.buyer_id = auth.uid() and t.seller_id = p.id)
        or (t.seller_id = auth.uid() and t.buyer_id = p.id)
   );

grant select on public_profile_for_counterparty to authenticated;
