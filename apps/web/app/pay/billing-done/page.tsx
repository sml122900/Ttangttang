"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// §5 돈 레지스터: 카드 등록 결과 화면. 위트 금지, 결과를 건조하게 알리고 앱으로 돌려보낸다.
// expo-web-browser의 openAuthSessionAsync가 이 커스텀 스킴 이동을 감지해 인앱 브라우저를 닫는다
// (Kakao 로그인 콜백과 동일한 패턴, apps/mobile/src/lib/auth.tsx 참고).
function BillingDoneInner() {
  const searchParams = useSearchParams();
  const ok = searchParams.get("ok") === "1";
  const reason = searchParams.get("reason");
  const clientRedirect = searchParams.get("clientRedirect");
  // Expo Go는 세션마다 다른 exp://<LAN-IP>:<port> 딥링크를 쓰므로, 모바일이 넘긴 clientRedirect가
  // 있으면 그걸 그대로 쓰고, 없을 때만(직접 브라우저로 열어본 경우 등) 고정 스킴으로 폴백한다.
  const scheme = process.env.NEXT_PUBLIC_APP_SCHEME ?? "ttangttang";
  const base = clientRedirect ?? `${scheme}://`;
  const deepLink = `${base}${base.includes("?") ? "&" : "?"}ok=${ok ? "1" : "0"}`;

  useEffect(() => {
    // 일부 모바일 브라우저는 사용자 제스처 없는 커스텀 스킴 이동을 막는다 —
    // 자동 시도 + 아래 버튼(수동 폴백)을 함께 둔다.
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-white px-6 text-center">
      <h1 className="text-lg font-bold tracking-tight text-ink">
        {ok ? "카드 등록 완료" : "카드 등록 실패"}
      </h1>
      <p className="text-sm leading-relaxed text-sub">
        {ok
          ? "등록된 카드는 낙찰되는 순간에만 결제돼요."
          : reason
            ? `다시 시도해주세요. (${decodeURIComponent(reason)})`
            : "다시 시도해주세요."}
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

export default function BillingDonePage() {
  return (
    <Suspense>
      <BillingDoneInner />
    </Suspense>
  );
}
