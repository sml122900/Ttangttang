-- §0 규칙 6 / §2: 최고 제시가와 지원자 수는 공개, 지원자 신상·개별 지원서는 판매자 전용.
--
-- security_invoker를 켜지 않은 채로 둔다(기본값 = off): 이 뷰는 소유자(postgres, RLS 우회) 권한으로
-- applications를 집계하므로, applications 행 자체를 볼 수 없는 anon/authenticated도 "집계 결과"만은
-- 조회할 수 있다. 신상 정보를 절대 select하지 않는 것으로 노출 범위를 제한한다.
create view item_public_stats as
select
  i.id as item_id,
  count(a.id) filter (where a.status in ('pending', 'accepted')) as applicant_count,
  max(a.offer_price) filter (where a.status in ('pending', 'accepted')) as top_offer_price
from items i
left join applications a on a.item_id = i.id
group by i.id;

grant select on item_public_stats to anon, authenticated;
