-- 개발 확인용으로 클라우드 프로젝트에 심은 seed.sql 데이터를 지울 때 사용.
-- 실행: npx supabase db query --linked -f supabase/cleanup_dev_seed.sql
delete from applications where item_id like 'aaaaaaaa-0000-0000-0000-%';
delete from items where id like 'aaaaaaaa-0000-0000-0000-%';
delete from auth.users where email like '%@ttangttang.local';
