import { Pressable, Text, View } from "react-native";
import { Chip } from "./Chip";
import { Ticket } from "./Ticket";
import { relativeTime, won } from "@/lib/format";

export interface ItemCardData {
  id: string;
  title: string;
  neighborhood: string;
  createdAt: string;
  startPrice: number;
  applicantCount: number;
  topOfferPrice: number | null;
}

// ttangttang-prototype.html .card — 썸네일 + 이름/메타/칩 + 최고 제시가 티켓.
export function ItemCard({ item, now, onPress }: { item: ItemCardData; now: number; onPress: () => void }) {
  const hasApplicants = item.applicantCount > 0;
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3.5 px-5 py-3.5 active:bg-[#F9FAFB]"
    >
      <View className="h-[76px] w-[76px] items-center justify-center rounded-xl border border-line-soft bg-[#F9FAFB]">
        <Text className="text-[28px]">📦</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-[15.5px] font-semibold tracking-tight text-ink">
          {item.title}
        </Text>
        <Text className="text-[13px] text-sub-2">
          {item.neighborhood} · {relativeTime(item.createdAt, now)} · 시작가 {won(item.startPrice)}
        </Text>
        <View className="mt-1.5 flex-row">
          {hasApplicants ? (
            <Chip tone="live">{`지원 ${item.applicantCount}명`}</Chip>
          ) : (
            <Chip tone="quiet">아직 지원 없음 — 선점 기회</Chip>
          )}
        </View>
      </View>
      <Ticket
        amountLabel={won(hasApplicants ? item.topOfferPrice ?? item.startPrice : item.startPrice)}
        label={hasApplicants ? "최고 제시" : "시작가"}
        notchColor="#FFFFFF"
      />
    </Pressable>
  );
}
