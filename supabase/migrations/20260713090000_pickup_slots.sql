-- §2 데이터 모델 변경: 방문 시간을 구매자 4택 고정에서 판매자 지정으로 뒤집는다.
-- 판매자가 등록 시점에 실제 가능한 방문 시간 슬롯(1~4개, 자유 텍스트)을 입력하고,
-- 구매자는 지원서 작성 시 그 매물의 슬롯 중 하나를 골라 applications.visit_time에 그대로
-- 저장한다. visit_time은 값의 출처만 바뀔 뿐 여전히 자유 텍스트라 컬럼 자체는 그대로 둔다.

alter table items
  add column pickup_slots text[] not null default '{}';

-- 기존 행은 슬롯이 없어 아래 개수 제약을 곧바로 위반하므로, 제약을 걸기 전에 먼저 채운다.
update items
   set pickup_slots = array['방문 시간은 채팅으로 문의해주세요']
 where cardinality(pickup_slots) = 0;

alter table items
  add constraint items_pickup_slots_count_chk
  check (cardinality(pickup_slots) between 1 and 4);
