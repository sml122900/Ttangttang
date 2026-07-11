import { Mark } from "./_components/Mark";
import { SiteFooter } from "./_components/SiteFooter";

const RULES = [
  {
    n: "1",
    title: "시작가는 1,000 / 3,000 / 5,000원",
    desc: "판매자는 가격을 고민하지 않아요. 셋 중 하나만 고르면 끝.",
  },
  {
    n: "2",
    title: "받고 싶으면 지원서, 30초면 충분해요",
    desc: "제시가 + 방문 가능 시간 + 한 줄 메시지. 지원은 무료고, 이 단계에서는 돈이 빠지지 않아요.",
  },
  {
    n: "3",
    title: "판매자가 땅땅 치면, 그 순간 결제까지 끝",
    desc: "낙찰자는 취소할 수 없고, 약속 시간 내 미수령(노쇼)이면 결제금 전액이 위약금으로 자동 정산돼요.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16 sm:py-24">
        <div className="flex items-center gap-3">
          <Mark />
          <span className="text-sm font-semibold tracking-tight text-sub-2">
            하이퍼로컬 중고나눔 · 소액거래
          </span>
        </div>

        <h1 className="mt-8 max-w-lg text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
          입찰은 지원서로,
          <br />
          확정은 땅땅.
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-sub">
          봉은 판매자가 두드린다. 찜하고 잠수, 노쇼, 유세 없는 동네 나눔·소액거래.
        </p>

        <ol className="mt-14 flex flex-col gap-8">
          {RULES.map((r) => (
            <li key={r.n} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-line-soft text-sm font-bold text-sub">
                {r.n}
              </span>
              <div>
                <b className="block text-base font-semibold tracking-tight text-ink">{r.title}</b>
                <span className="mt-1 block text-sm leading-relaxed text-sub">{r.desc}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-16 flex flex-col gap-3 sm:flex-row">
          <span
            aria-disabled
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line px-5 text-sm font-semibold text-sub-2 sm:flex-none sm:w-48"
          >
            Google Play · 출시 예정
          </span>
          <span
            aria-disabled
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-line px-5 text-sm font-semibold text-sub-2 sm:flex-none sm:w-48"
          >
            App Store · 출시 예정
          </span>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
