import type { Metadata } from "next";
import { LegalDraftBanner } from "../_components/LegalDraftBanner";

export const metadata: Metadata = { title: "개인정보처리방침" };

const SECTIONS = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: "닉네임, 동네(활동 지역), 전화번호 또는 카카오 계정 식별자, 거래 내역(수령률·거래횟수), 결제를 위한 빌링키(토스페이먼츠가 발급 · 회사는 카드 원본 정보를 저장하지 않습니다).",
  },
  {
    title: "2. 이용 목적",
    body: "지원서·낙찰·자동결제 처리, 노쇼 시 위약금 정산, 신뢰 지표(수령률) 산출, 부정 이용(잦은 지원 철회 등) 방지.",
  },
  {
    title: "3. 지원자 정보의 제한적 공개",
    body: "매물의 최고 제시가와 지원자 수는 다른 이용자에게 공개되나, 지원자 개인 정보(닉네임·제시가·방문 시간·메시지)는 해당 매물의 판매자에게만 제공됩니다.",
  },
  {
    title: "4. 보유 및 이용 기간",
    body: "회원 탈퇴 시 또는 법령에서 정한 보존 기간까지 보관 후 파기합니다. (전자상거래법 등에 따른 거래기록 보존 기간은 법률 검토 필요)",
    flagged: true,
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-surface-money px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">개인정보처리방침</h1>
      <LegalDraftBanner />
      <div className="flex flex-col gap-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-base font-semibold tracking-tight text-ink">
              {s.title}
              {s.flagged && (
                <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs font-semibold text-danger">
                  법률 검토
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{s.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
