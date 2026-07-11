import type { Metadata } from "next";
import { LegalDraftBanner } from "../_components/LegalDraftBanner";

export const metadata: Metadata = { title: "이용약관" };

const ARTICLES = [
  {
    title: "제1조 (목적)",
    body: "이 약관은 땅땅(이하 “회사”)이 제공하는 하이퍼로컬 중고나눔·소액거래 서비스(이하 “서비스”)의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.",
  },
  {
    title: "제2조 (지원서와 낙찰)",
    body: "회원은 매물에 대해 시작가 이상의 금액으로 지원서를 제출할 수 있습니다. 지원서 제출 시에는 결제가 이루어지지 않으며, 판매자가 지원서를 수락하는 순간 낙찰이 확정되고 등록된 결제수단으로 즉시 자동결제가 이루어집니다.",
    flagged: true,
  },
  {
    title: "제3조 (청약철회의 제한)",
    body: "낙찰(수락) 이후에는 매수인의 청약철회가 제한됩니다. 이는 전자상거래 등에서의 소비자보호에 관한 법률 제17조 제2항 각 호에서 정한 청약철회 제한 사유 구성을 전제로 하며, 구체적 근거 조항 해당 여부는 법률 검토가 필요합니다.",
    flagged: true,
  },
  {
    title: "제4조 (위약금 — 미수령 시 자동 정산)",
    body: "매수인이 판매자와 약속한 수령 시간 내에 물품을 수령하지 않는 경우(노쇼), 결제된 금액 전액은 위약금으로 판매자에게 자동 정산됩니다.",
    flagged: true,
  },
  {
    title: "제5조 (수수료)",
    body: "회사는 MVP 기간 동안 거래 수수료를 부과하지 않습니다.",
  },
];

export default function TermsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-surface-money px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight text-ink">이용약관</h1>
      <LegalDraftBanner />
      <div className="flex flex-col gap-8">
        {ARTICLES.map((a) => (
          <section key={a.title}>
            <h2 className="text-base font-semibold tracking-tight text-ink">
              {a.title}
              {a.flagged && (
                <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs font-semibold text-danger">
                  법률 검토
                </span>
              )}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">{a.body}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
