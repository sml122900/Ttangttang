import type { Metadata } from "next";
import { LegalDraftBanner } from "../_components/LegalDraftBanner";
import { SiteFooter } from "../_components/SiteFooter";

export const metadata: Metadata = { title: "개인정보처리방침" };

// 플레이스토어 데이터 보안 양식·개인정보보호법 제30조 필수 항목 기준으로 구성했다
// (docs/launch-audit.md §3 갭 체크, docs/decisions/environment-separation.md).
// [담당자], [이메일] 등 대괄호 항목은 실제 값을 알 수 없어 채우지 않은 자리표시자 —
// 배포 전 반드시 채울 것 (아래 8조 근처).
const SECTIONS = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: "닉네임, 동네(활동 지역), 카카오 계정 식별자(이메일 포함 여부는 카카오 로그인 동의항목에 따름), 거래 내역(수령률·거래횟수), 지원서·매물·채팅 내용, 매물 사진(등록 시 선택적으로 AI 등록 도우미에 이용), 결제를 위한 빌링키(토스페이먼츠가 발급 · 회사는 카드 원본 정보를 저장하지 않습니다).",
  },
  {
    title: "2. 이용 목적",
    body: "지원서·낙찰·자동결제 처리, 노쇼 시 위약금 정산, 신뢰 지표(수령률) 산출, 부정 이용(잦은 지원 철회, 어뷰징 신고 등) 방지, 서비스 문의 응대, 매물 사진을 이용한 등록 정보(제목·설명·시작가) 초안 생성(선택 기능, AI 등록 도우미).",
  },
  {
    title: "3. 지원자 정보의 제한적 공개",
    body: "매물의 최고 제시가와 지원자 수는 다른 이용자에게 공개되나, 지원자 개인 정보(닉네임·제시가·방문 시간·메시지)는 해당 매물의 판매자에게만 제공됩니다.",
  },
  {
    title: "4. 개인정보 처리 위탁",
    body: "서비스 운영을 위해 아래 업체에 개인정보 처리를 위탁하고 있습니다: Supabase, Inc.(데이터베이스·인증·실시간 채팅, 서버 소재지 대한민국 서울), 비바리퍼블리카(토스페이먼츠, 결제·빌링키 발급), 카카오(소셜 로그인), Vercel Inc.(웹 서버 호스팅), Anthropic, PBC(AI 등록 도우미 — 이용자가 등록 화면에서 사진을 첨부하면 그 사진을 분석해 제목·설명·시작가 초안을 생성; 사진을 첨부하지 않으면 이용되지 않습니다). 위탁받은 업체가 개인정보보호법을 위반하지 않도록 관리·감독합니다.",
  },
  {
    title: "5. 개인정보의 국외 이전",
    body: "Supabase의 데이터베이스 서버는 대한민국(서울) 리전에 위치합니다. 다만 Supabase, Inc.와 Vercel Inc.는 해외(미국) 법인으로, 서비스 운영·장애 대응 과정에서 해당 법인이 국외에서 데이터에 접근할 가능성이 있어 국외 이전에 해당하는지는 법률 검토가 필요합니다. 추후 Expo 푸시 알림(FCM/APNs)을 도입하면 기기 토큰이 국외(Google·Apple)로 전송됩니다.\n\nAnthropic, PBC(미국)로는 아래와 같이 개인정보가 이전됩니다 — 이 건은 서버 소재지 여부와 무관하게 사진 데이터 자체가 매 호출마다 국외 서버로 실시간 전송되는 것이라 국외 이전에 해당합니다: 이전받는 자 Anthropic, PBC(미국) / 이전 항목 매물 사진(등록 화면에서 이용자가 AI 등록 도우미를 사용할 때 첨부한 사진에 한함) / 이전 목적 사진을 분석해 매물 제목·설명·시작가 초안 생성 / 이전 방법 사진 업로드 시 앱 서버를 통한 네트워크 전송(API 호출) / 이전 시점 AI 등록 도우미 사용(사진 첨부) 시마다 / 보유 기간 Anthropic의 API 데이터 보유·처리 정책을 확인하지 못해 아직 기재하지 못했습니다 — 확인 후 반영하겠습니다.",
    flagged: true,
  },
  {
    title: "6. 보유 및 이용 기간",
    body: "회원 탈퇴 시 닉네임 등 식별 정보는 즉시 파기하거나 \"탈퇴한 사용자\"로 익명화합니다. 단, 전자상거래 등에서의 소비자보호에 관한 법률 시행령에 따라 계약 또는 청약철회 등에 관한 기록 5년, 대금결제 및 재화 등의 공급에 관한 기록 5년, 소비자의 불만 또는 분쟁처리에 관한 기록 3년은 관련 법령이 정한 기간 동안 보존 후 파기합니다. 구체적 보존 항목·기간의 최종 적용은 법률 검토가 필요합니다.",
    flagged: true,
  },
  {
    title: "7. 파기 절차 및 방법",
    body: "보유 기간이 지난 개인정보는 지체 없이 파기합니다. 전자적 파일은 복구 불가능한 방법으로 영구 삭제하며, 법령에 따라 보존이 필요한 거래·결제 기록은 별도 보관 후 기간 경과 시 파기합니다.",
  },
  {
    title: "8. 정보주체의 권리와 행사 방법",
    body: "이용자는 언제든 본인의 개인정보 열람·정정·삭제·처리정지를 요청할 수 있습니다. 회원 탈퇴(계정 삭제)는 앱 내 거래 탭 > 설정 메뉴에서 즉시 처리되며, 앱을 쓸 수 없는 경우 ttangttang-web.vercel.app/account/delete 에서도 요청할 수 있습니다.",
  },
  {
    title: "9. 개인정보 보호책임자",
    body: "성명: [담당자명] · 이메일: [이메일 주소] · 개인정보 처리와 관련한 문의·불만 처리·피해 구제를 담당합니다.",
    flagged: true,
  },
];

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 bg-surface-money px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-ink">개인정보처리방침</h1>
        <p className="text-xs text-sub-2">시행일: 2026-09-28</p>
        <LegalDraftBanner />
        <div className="flex flex-col gap-8">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="text-base font-semibold tracking-tight text-ink">
                {s.title}
                {s.flagged && (
                  <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-xs font-semibold text-danger">
                    법률 검토 · 정보 보완 필요
                  </span>
                )}
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">{s.body}</p>
            </section>
          ))}
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
