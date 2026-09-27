import { getBillingSession, isUsable } from "@/lib/billing-session";
import { BillingAuthClient } from "./BillingAuthClient";

type Props = { searchParams: Promise<{ session?: string }> };

// customerKey는 쿼리가 아니라 서버의 1회용 세션에서 꺼낸다 (§4 P5) — 앱이 POST /api/billing/session으로
// 발급받은 세션의 주인만 카드 등록 대상이 될 수 있다.
export default async function BillingAuthPage({ searchParams }: Props) {
  const { session: sessionId } = await searchParams;
  const session = await getBillingSession(sessionId);

  if (!session || !isUsable(session)) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-sm text-ink-2">카드 등록 요청이 만료됐어요. 앱에서 다시 시도해주세요.</p>
      </main>
    );
  }

  return <BillingAuthClient sessionId={session.id} customerKey={session.profile_id} />;
}
