import type { Metadata } from "next";
import { LegalDraftBanner } from "../_components/LegalDraftBanner";
import { SiteFooter } from "../_components/SiteFooter";

export const metadata: Metadata = { title: "이용약관" };

const ARTICLES = [
  {
    title: "제1조 (목적)",
    body: "이 약관은 땅땅(이하 \"회사\")이 제공하는 하이퍼로컬 중고나눔·소액거래 서비스(이하 \"서비스\")의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.",
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
  {
    title: "제6조 (게시물 및 금지행위)",
    body: "회원은 매물 등록·지원서·채팅 등에 타인의 권리를 침해하거나 불법·음란·사기성 내용을 게시할 수 없습니다. 회사는 신고 접수 또는 자체 확인을 통해 위반 게시물을 삭제하고, 위반 회원의 서비스 이용을 제한하거나 이용계약을 해지할 수 있습니다. 회원은 다른 회원을 차단하여 매물·채팅 노출을 상호 제한할 수 있습니다.",
  },
  {
    title: "제7조 (회원 탈퇴)",
    body: "회원은 앱 내 설정 메뉴 또는 회사가 제공하는 웹 페이지를 통해 언제든 탈퇴를 요청할 수 있습니다. 탈퇴 시 개인 식별 정보는 삭제 또는 익명화되며, 법령에 따라 보존이 필요한 거래·결제 기록은 개인정보처리방침 제6조에 따라 별도 보관됩니다. 진행 중인 거래(결제 완료 후 수령 전)가 있는 경우 해당 거래 종료 후 탈퇴 처리될 수 있습니다.",
    flagged: true,
  },
];

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-surface-money px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-ink">이용약관</h1>
        <p className="text-xs text-sub-2">시행일: 2026-09-28</p>
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
      <SiteFooter />
    </div>
  );
}
