import { supabase } from "./supabase";
import type { ItemCardData } from "@/components/ItemCard";

interface ItemRow {
  id: string;
  title: string;
  description: string;
  start_price: number;
  neighborhood: string;
  status: string;
  created_at: string;
}

interface StatsRow {
  item_id: string;
  applicant_count: number;
  top_offer_price: number | null;
}

// item_public_stats는 뷰라 items<->stats 사이에 PostgREST가 자동으로 인식할 FK가 없다.
// 두 번 조회해서 클라이언트에서 합친다 (§2: 지원자 수·최고 제시가는 공개 뷰로만 노출).
export async function fetchFeedItems(): Promise<ItemCardData[]> {
  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id,title,description,start_price,neighborhood,status,created_at")
    .eq("status", "live")
    .order("created_at", { ascending: false })
    .returns<ItemRow[]>();
  if (itemsError) throw itemsError;
  if (!items || items.length === 0) return [];

  const { data: stats, error: statsError } = await supabase
    .from("item_public_stats")
    .select("item_id,applicant_count,top_offer_price")
    .in(
      "item_id",
      items.map((it) => it.id),
    )
    .returns<StatsRow[]>();
  if (statsError) throw statsError;

  const statsByItemId = new Map((stats ?? []).map((s) => [s.item_id, s]));

  return items.map((it) => {
    const stat = statsByItemId.get(it.id);
    return {
      id: it.id,
      title: it.title,
      neighborhood: it.neighborhood,
      createdAt: it.created_at,
      startPrice: it.start_price,
      applicantCount: stat?.applicant_count ?? 0,
      topOfferPrice: stat?.top_offer_price ?? null,
    };
  });
}

export interface ItemDetail {
  id: string;
  title: string;
  description: string;
  neighborhood: string;
  startPrice: number;
  status: string;
  createdAt: string;
  applicantCount: number;
  topOfferPrice: number | null;
}

export async function fetchItemDetail(id: string): Promise<ItemDetail | null> {
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("id,title,description,start_price,neighborhood,status,created_at")
    .eq("id", id)
    .maybeSingle<ItemRow>();
  if (itemError) throw itemError;
  if (!item) return null;

  const { data: stat, error: statsError } = await supabase
    .from("item_public_stats")
    .select("item_id,applicant_count,top_offer_price")
    .eq("item_id", id)
    .maybeSingle<StatsRow>();
  if (statsError) throw statsError;

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    neighborhood: item.neighborhood,
    startPrice: item.start_price,
    status: item.status,
    createdAt: item.created_at,
    applicantCount: stat?.applicant_count ?? 0,
    topOfferPrice: stat?.top_offer_price ?? null,
  };
}

export interface MyItemRow extends ItemRow {
  applicantCount: number;
  topOfferPrice: number | null;
}

export async function fetchMyItems(sellerId: string): Promise<MyItemRow[]> {
  const { data: items, error } = await supabase
    .from("items")
    .select("id,title,description,start_price,neighborhood,status,created_at")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .returns<ItemRow[]>();
  if (error) throw error;
  if (!items || items.length === 0) return [];

  const { data: stats, error: statsError } = await supabase
    .from("item_public_stats")
    .select("item_id,applicant_count,top_offer_price")
    .in(
      "item_id",
      items.map((it) => it.id),
    )
    .returns<StatsRow[]>();
  if (statsError) throw statsError;

  const statsByItemId = new Map((stats ?? []).map((s) => [s.item_id, s]));
  return items.map((it) => {
    const stat = statsByItemId.get(it.id);
    return { ...it, applicantCount: stat?.applicant_count ?? 0, topOfferPrice: stat?.top_offer_price ?? null };
  });
}
