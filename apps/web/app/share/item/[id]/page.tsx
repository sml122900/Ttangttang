import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase";

type Props = { params: Promise<{ id: string }> };

interface ShareItemRow {
  id: string;
  title: string;
  description: string;
  start_price: number;
  neighborhood: string;
  status: string;
}

interface ShareStatsRow {
  applicant_count: number;
  top_offer_price: number | null;
}

function won(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

async function getItemShareData(id: string) {
  const supabase = createPublicSupabaseClient();
  const { data: item } = await supabase
    .from("items")
    .select("id,title,description,start_price,neighborhood,status")
    .eq("id", id)
    .maybeSingle<ShareItemRow>();
  if (!item) return null;

  const { data: stats } = await supabase
    .from("item_public_stats")
    .select("applicant_count,top_offer_price")
    .eq("item_id", id)
    .maybeSingle<ShareStatsRow>();

  return { item, stats };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getItemShareData(id);
  if (!data) {
    return { title: "매물을 찾을 수 없어요" };
  }
  const { item, stats } = data;
  const applicantCount = stats?.applicant_count ?? 0;
  const topLabel = applicantCount > 0 ? "현재 최고" : "시작가";
  const topAmount = applicantCount > 0 ? stats?.top_offer_price ?? item.start_price : item.start_price;

  const title = `${item.title} · ${topLabel} ${won(topAmount)}`;
  const description = `${item.neighborhood} · 지원 ${applicantCount}명 · ${item.description.slice(0, 80)}`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function ShareItemPage({ params }: Props) {
  const { id } = await params;
  const data = await getItemShareData(id);
  if (!data) notFound();
  const { item, stats } = data;

  const scheme = process.env.NEXT_PUBLIC_APP_SCHEME ?? "ttangttang";
  const deepLink = `${scheme}://item/${id}`;
  const applicantCount = stats?.applicant_count ?? 0;
  const topAmount = applicantCount > 0 ? stats?.top_offer_price ?? item.start_price : item.start_price;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-12">
      <span className="text-xs font-semibold text-sub-2">{item.neighborhood}</span>
      <h1 className="mt-1 text-xl font-bold tracking-tight text-ink">{item.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-2">{item.description}</p>

      <div className="mt-6 flex rounded-2xl border border-line">
        <div className="flex-1 border-r border-line-soft px-3 py-3 text-center">
          <div className="text-xs text-sub-2">시작가</div>
          <div className="tabular-nums mt-1 text-base font-extrabold">{won(item.start_price)}</div>
        </div>
        <div className="flex-1 border-r border-line-soft px-3 py-3 text-center">
          <div className="text-xs text-sub-2">{applicantCount > 0 ? "현재 최고" : "지원 대기"}</div>
          <div className="tabular-nums mt-1 text-base font-extrabold text-brand">
            {applicantCount > 0 ? won(topAmount) : "—"}
          </div>
        </div>
        <div className="flex-1 px-3 py-3 text-center">
          <div className="text-xs text-sub-2">지원</div>
          <div className="tabular-nums mt-1 text-base font-extrabold">{applicantCount}명</div>
        </div>
      </div>

      <a
        href={deepLink}
        className="mt-8 flex h-14 items-center justify-center rounded-2xl bg-brand text-base font-bold text-white active:bg-brand-press"
      >
        땅땅 앱에서 지원서 쓰기 (30초)
      </a>
    </main>
  );
}
