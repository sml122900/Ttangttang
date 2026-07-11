export function LegalDraftBanner() {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm leading-relaxed text-ink-2">
      <b className="font-semibold text-danger">법률 검토 전 초안입니다.</b> 청약철회 제한(전자상거래법
      제17조 예외 구성), 위약금 규정, 수락 즉시 자동결제 동의 조항은 PROJECT.md §4에서 법률 검토
      항목으로 표기되어 있습니다. 실제 서비스 반영 전 반드시 법률 자문을 거쳐주세요.
    </div>
  );
}
