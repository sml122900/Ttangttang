import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { AuctionStrip } from "@/components/AuctionStrip";
import { fetchItemDetail, type ItemDetail } from "@/lib/items";
import { won } from "@/lib/format";

const SAFETY_STEPS = [
  { n: "1", title: "지원은 공짜예요", desc: "카드만 등록하고 지원해요. 지원 단계에서는 돈이 빠지지 않아요." },
  {
    n: "2",
    title: "낙찰되면 그 순간 자동 결제",
    desc: "판매자가 내 지원서를 수락하면 등록된 카드로 즉시 결제되고, 취소할 수 없어요.",
  },
  {
    n: "3",
    title: "노쇼 시 자동 정산",
    desc: "약속 시간 내 수령하지 않으면 결제금 전액이 위약금으로 판매자에게 지급돼요.",
  },
];

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchItemDetail(id)
      .then((result) => {
        if (!cancelled) setItem(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center px-3 pb-2.5 pt-3.5">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl active:bg-line-soft"
        >
          <Feather name="arrow-left" size={22} color="#191F28" />
        </Pressable>
      </View>

      {loading || error || !item ? (
        <View className="flex-1 items-center justify-center px-10">
          <Text className="text-center text-sm text-sub-2">
            {error ?? (loading ? "불러오는 중…" : "매물을 찾을 수 없어요")}
          </Text>
        </View>
      ) : (
        <>
          <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 8 }}>
            <View className="h-[220px] items-center justify-center border-b border-line-soft bg-white">
              <Text className="text-[64px]">📦</Text>
            </View>
            <View className="px-5 pt-4">
              <Text className="text-[20px] font-bold leading-tight tracking-tight text-ink">
                {item.title}
              </Text>
              <Text className="mt-1.5 text-[13.5px] text-sub-2">{item.neighborhood}</Text>
            </View>

            <AuctionStrip
              startPrice={item.startPrice}
              topOfferPrice={item.topOfferPrice}
              applicantCount={item.applicantCount}
            />

            <View className="px-5 pt-3.5">
              <Text className="text-[15px] leading-[1.65] tracking-tight text-ink-2">
                {item.description}
              </Text>
            </View>

            <View className="px-5 py-4">
              <Text className="mb-2.5 text-[15px] font-bold tracking-tight text-ink">
                이 거래가 안전한 이유
              </Text>
              {SAFETY_STEPS.map((step) => (
                <View key={step.n} className="flex-row gap-3 py-2">
                  <View className="mt-0.5 h-[22px] w-[22px] items-center justify-center rounded-full bg-line-soft">
                    <Text className="text-xs font-bold text-sub">{step.n}</Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold tracking-tight text-ink">{step.title}</Text>
                    <Text className="mt-0.5 text-[13px] leading-relaxed text-sub">{step.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>

          <View
            className="flex-row items-center gap-3 border-t border-line-soft bg-white px-5 pt-3"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            <View>
              <Text className="tabular-nums text-xl font-extrabold tracking-tight text-ink">
                {won(item.applicantCount > 0 ? item.topOfferPrice ?? item.startPrice : item.startPrice)}
              </Text>
              <Text className="text-xs text-sub-2">
                {item.applicantCount > 0 ? "현재 최고 제시가" : "시작가"}
              </Text>
            </View>
            <Pressable
              className="h-[54px] flex-1 items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-40"
              disabled={item.status !== "live"}
              onPress={() => router.push(`/item/${item.id}/apply`)}
            >
              <Text className="text-[16.5px] font-bold tracking-tight text-white">
                {item.status === "live" ? "지원서 쓰기 (30초)" : "마감된 매물이에요"}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
