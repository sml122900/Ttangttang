import type { Metadata } from "next";
import { SiteFooter } from "../../_components/SiteFooter";
import { DeleteRequestForm } from "./DeleteRequestForm";

export const metadata: Metadata = { title: "계정 삭제" };

// 플레이스토어 데이터 삭제 정책 — 앱을 지웠거나 로그인할 수 없는 사용자도 계정 삭제를
// 요청할 수 있는 공개 URL. 앱 안(설정 > 계정 삭제)이 즉시 처리되는 경로고, 여기는 그게
// 안 될 때의 대안이다.
export default function AccountDeletePage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 bg-surface-money px-6 py-16">
        <h1 className="text-2xl font-bold tracking-tight text-ink">계정 삭제</h1>

        <section>
          <h2 className="text-base font-semibold tracking-tight text-ink">앱에서 바로 삭제하기 (권장)</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            땅땅 앱 → 거래 탭 → 설정 → 계정 삭제에서 즉시 처리할 수 있어요. 닉네임 등 개인 식별
            정보는 삭제·익명화되고, 법령에 따라 보존이 필요한 거래·결제 기록만 별도 보관됩니다
            (자세한 내용은 개인정보처리방침 참고).
          </p>
        </section>

        <section>
          <h2 className="text-base font-semibold tracking-tight text-ink">앱을 쓸 수 없다면</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            휴대폰을 바꿨거나 앱을 지운 경우, 아래로 삭제를 요청해주세요. 본인 확인 후 처리합니다.
            <br />
            진행 중인(결제 완료 후 아직 수령 전인) 거래가 있으면 그 거래가 끝난 뒤 처리돼요.
          </p>
          <div className="mt-4">
            <DeleteRequestForm />
          </div>
        </section>
      </div>
      <SiteFooter />
    </div>
  );
}
