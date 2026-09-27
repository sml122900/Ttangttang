import { appScheme, getBillingSession } from "@/lib/billing-session";
import { DeepLinkRedirect } from "./DeepLinkRedirect";

type Props = { searchParams: Promise<{ ok?: string; reason?: string; session?: string }> };

// §5 돈 레지스터: 카드 등록 결과 화면. 위트 금지, 결과를 건조하게 알리고 앱으로 돌려보낸다.
// expo-web-browser의 openAuthSessionAsync가 이 딥링크 이동을 감지해 인앱 브라우저를 닫는다.
// 돌아갈 딥링크는 세션에 저장된(발급 시 허용 스킴 검증을 통과한) 값만 쓴다 — 쿼리로 받은
// 임의 URL로는 절대 보내지 않는다 (§4 P5 오픈 리다이렉트 차단).
export default async function BillingDonePage({ searchParams }: Props) {
  const { ok: okParam, reason, session: sessionId } = await searchParams;
  const ok = okParam === "1";
  const session = await getBillingSession(sessionId);
  const base = session?.client_redirect ?? `${appScheme()}://`;
  const deepLink = `${base}${base.includes("?") ? "&" : "?"}ok=${ok ? "1" : "0"}`;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <DeepLinkRedirect href={deepLink} />
      <h1 className="text-lg font-bold tracking-tight text-ink">{ok ? "카드 등록 완료" : "카드 등록 실패"}</h1>
      <p className="text-sm leading-relaxed text-sub">
        {ok ? "등록된 카드는 낙찰되는 순간에만 결제돼요." : reason ? `다시 시도해주세요. (${reason})` : "다시 시도해주세요."}
      </p>
      <a
        href={deepLink}
        className="mt-2 flex h-12 items-center justify-center rounded-2xl bg-brand px-6 text-sm font-bold text-white"
      >
        앱으로 돌아가기
      </a>
    </main>
  );
}
