"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: (params: { customerKey: string }) => {
        requestBillingAuth: (params: {
          method: "CARD";
          successUrl: string;
          failUrl: string;
        }) => Promise<void>;
      };
    };
  }
}

// §4 결제 리스크 / §5 돈 레지스터: 카드 등록은 결제 행위이므로 위트 없이 건조하게.
// 토스 SDK가 이 페이지에서 곧장 토스 호스팅 카드등록 화면으로 리다이렉트한다 — 여기 UI는
// SDK 로딩 중 잠깐 보이는 대기 화면일 뿐이다.
export function BillingAuthClient({ sessionId, customerKey }: { sessionId: string; customerKey: string }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdkReady) return;
    const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
    if (!clientKey) {
      setError("NEXT_PUBLIC_TOSS_CLIENT_KEY is not set");
      return;
    }
    if (!window.TossPayments) {
      setError("토스 SDK 로딩에 실패했어요");
      return;
    }
    const origin = window.location.origin;
    // 돌아갈 앱 딥링크는 URL에 싣지 않는다 — 서버가 세션에 저장해둔 값만 쓴다 (§4 P5).
    const sessionQS = `session=${encodeURIComponent(sessionId)}`;
    window
      .TossPayments(clientKey)
      .payment({ customerKey })
      .requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/api/billing/callback?${sessionQS}`,
        failUrl: `${origin}/pay/billing-done?ok=0&${sessionQS}`,
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [sdkReady, sessionId, customerKey]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <Script src="https://js.tosspayments.com/v2/standard" onLoad={() => setSdkReady(true)} />
      {error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <p className="text-sm text-sub">카드 등록 화면으로 이동하는 중…</p>
      )}
    </main>
  );
}
