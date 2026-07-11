"use client";

import { Suspense, useEffect, useState } from "react";
import Script from "next/script";
import { useSearchParams } from "next/navigation";

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
function BillingAuthInner() {
  const searchParams = useSearchParams();
  const customerKey = searchParams.get("customerKey");
  // Expo Go에서는 앱의 딥링크가 고정된 ttangttang:// 스킴이 아니라 세션마다 다른
  // exp://<LAN-IP>:<port> 형태다 — 모바일이 자기 redirectTo를 여기로 실어 보내고,
  // 토스 successUrl/failUrl → billing-done 페이지까지 그대로 들고 다닌다.
  const clientRedirect = searchParams.get("clientRedirect");
  const [sdkReady, setSdkReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdkReady || !customerKey || !clientRedirect) return;
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
    const redirectQS = `clientRedirect=${encodeURIComponent(clientRedirect)}`;
    const tossPayments = window.TossPayments(clientKey);
    const payment = tossPayments.payment({ customerKey });
    payment
      .requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/api/billing/callback?${redirectQS}`,
        failUrl: `${origin}/pay/billing-done?ok=0&${redirectQS}`,
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [sdkReady, customerKey, clientRedirect]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <Script
        src="https://js.tosspayments.com/v2/standard"
        onLoad={() => setSdkReady(true)}
      />
      {!customerKey || !clientRedirect ? (
        <p className="text-sm text-ink-2">customerKey가 없어요. 앱에서 다시 시도해주세요.</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : (
        <p className="text-sm text-sub">카드 등록 화면으로 이동하는 중…</p>
      )}
    </main>
  );
}

export default function BillingAuthPage() {
  return (
    <Suspense>
      <BillingAuthInner />
    </Suspense>
  );
}
