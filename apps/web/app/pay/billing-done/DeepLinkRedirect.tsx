"use client";

import { useEffect } from "react";

// 일부 모바일 브라우저는 사용자 제스처 없는 커스텀 스킴 이동을 막는다 —
// 자동 시도 + 페이지의 "앱으로 돌아가기" 버튼(수동 폴백)을 함께 둔다.
export function DeepLinkRedirect({ href }: { href: string }) {
  useEffect(() => {
    window.location.href = href;
  }, [href]);
  return null;
}
