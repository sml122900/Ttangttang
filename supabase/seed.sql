-- 로컬 개발용 데모 데이터. `supabase start`/`supabase db reset` 때 자동 적용된다.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'seed-seller@ttangttang.local'),
  ('22222222-2222-2222-2222-222222222222', 'seed-applicant1@ttangttang.local'),
  ('33333333-3333-3333-3333-333333333333', 'seed-applicant2@ttangttang.local')
on conflict (id) do nothing;

-- profiles는 handle_new_user() 트리거가 자동으로 만들지만, 데모용으로 원하는 닉네임/동네를 정해준다.
update profiles set nickname = '행당동집주인', neighborhood = '행당동'
  where id = '11111111-1111-1111-1111-111111111111';
update profiles set nickname = '성수동감자', neighborhood = '행당동', receive_rate = 100, trade_count = 12
  where id = '22222222-2222-2222-2222-222222222222';
update profiles set nickname = '왕십리곰', neighborhood = '행당동', receive_rate = 96, trade_count = 31
  where id = '33333333-3333-3333-3333-333333333333';

insert into items (id, seller_id, title, description, start_price, neighborhood, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '원목 사이드 테이블', '이사 가면서 정리해요. 상판에 옅은 생활기스 있고 다리 흔들림 없습니다. 오늘 저녁 7시 이후 왕십리역 2번 출구에서 드려요.',
   1000, '행당동', now() - interval '10 minutes'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '자료구조/알고리즘 전공서 4권 일괄', '졸업하면서 정리합니다. 필기 조금 있지만 상태 깨끗해요. 4권 일괄로만 드립니다.',
   3000, '사근동', now() - interval '32 minutes'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '아기 장난감 모음 (소독 완료)', '아이가 커서 안 가지고 놀아요. 전부 세척·소독해뒀습니다. 문고리 거래 가능해요.',
   1000, '행당동', now() - interval '1 hour'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   '3구 인덕션 프라이팬 세트', '6개월 사용, 코팅 손상 없습니다. 28cm 궁중팬 포함 3종. 주말 오전 수령 선호합니다.',
   5000, '마장동', now() - interval '2 hours')
on conflict (id) do nothing;

insert into applications (item_id, applicant_id, offer_price, visit_time, message) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 3000, '오늘 저녁 7시 이후', '바로 앞 살아요.'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 3000, '내일 오전', '학교 다녀오는 길에 들를게요.'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 6000, '주말 오전', '세트로 잘 쓸게요.'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 8000, '주말 아무때나', '요리 좋아해서 꼭 받고 싶어요.')
on conflict (item_id, applicant_id) do nothing;
