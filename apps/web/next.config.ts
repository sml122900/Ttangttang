import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // scripts/verify-stage4.mjs가 같은 apps/web을 동시에 두 개 띄운다(하나는 실제 Claude API,
  // 하나는 타임아웃 재현용 모의 서버) — Next.js 16의 dev 서버 락 파일이 distDir 안에 있어서,
  // 기본값(.next)을 공유하면 두 번째 인스턴스가 "Another next dev server is already running"으로
  // 거부된다. NEXT_DIST_DIR이 있을 때만 다른 디렉터리를 쓰게 해 로컬/Vercel 빌드에는 영향 없다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
