-- items.seller_id/applications.applicant_id는 profiles(id)를 NOT NULL FK로 참조하는데,
-- 카카오 로그인만으로는 profiles 행이 생기지 않는다. auth.users insert에 훅을 걸어 자동 생성한다.
-- neighborhood는 Phase 2에 동네 선택 온보딩이 없어 임시값을 넣는다 — 추후 프로필 수정에서 채운다.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname, neighborhood)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'nickname',
      new.raw_user_meta_data ->> 'full_name',
      '이웃' || substr(new.id::text, 1, 4)
    ),
    '동네 미설정'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
