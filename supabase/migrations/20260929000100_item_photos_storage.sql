-- 4단계 — 매물 사진 실업로드. 공개 버킷(피드/공유랜딩에서 누구나 봐야 하므로 §0 규칙 6과
-- 같은 공개 원칙) + 업로드는 본인 폴더(item-photos/<uid>/...)로만 제한한다.
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', true)
on conflict (id) do nothing;

create policy "item_photos_select_public" on storage.objects
  for select
  using (bucket_id = 'item-photos');

create policy "item_photos_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "item_photos_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'item-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
