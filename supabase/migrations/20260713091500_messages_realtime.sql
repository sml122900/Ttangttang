-- §6 chat/[txId].tsx가 Supabase Realtime(postgres_changes)으로 새 메시지를 구독할 수 있으려면
-- messages 테이블이 supabase_realtime publication에 들어있어야 한다. RLS는 이미
-- rls_policies.sql의 messages_select_party/messages_insert_party가 당사자(buyer_id/seller_id)만
-- 허용하도록 걸려 있고, Realtime의 postgres_changes 구독도 그 RLS를 그대로 적용받는다.
alter publication supabase_realtime add table messages;
