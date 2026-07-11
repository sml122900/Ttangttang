import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ItemCard, type ItemCardData } from "@/components/ItemCard";
import { fetchFeedItems } from "@/lib/items";

export default function HomeFeedScreen() {
  const [items, setItems] = useState<ItemCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await fetchFeedItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-5 pb-2.5 pt-3.5">
        <Text className="text-[19px] font-bold tracking-tight text-ink">땅땅</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            <View className="mx-5 mb-3.5 mt-1 flex-row items-center gap-3 rounded-card border border-line bg-surface-warm px-4 py-3.5">
              <View className="h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-brand-tint">
                <Text className="text-[13px] font-extrabold text-brand">땅땅</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[14.5px] font-bold tracking-tight text-ink">
                  땅땅 치고 데려가세요
                </Text>
                <Text className="mt-0.5 text-[13px] leading-[1.45] text-sub">
                  지원서는 공짜 · 결제는 낙찰 순간 · 노쇼는 자동 정산
                </Text>
              </View>
            </View>
            <Text className="px-5 pb-2.5 text-[13px] font-semibold text-sub-2">우리 동네 나눔</Text>
          </>
        }
        renderItem={({ item }) => (
          <ItemCard item={item} now={Date.now()} onPress={() => router.push(`/item/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View className="h-px bg-line-soft" />}
        contentContainerStyle={{ backgroundColor: "#FFFFFF", flexGrow: 1 }}
        ListEmptyComponent={
          !loading ? (
            <View className="items-center px-10 py-16">
              {error ? (
                <Text className="text-center text-sm text-danger">{error}</Text>
              ) : (
                <>
                  <Text className="mb-3 text-4xl">🎫</Text>
                  <Text className="text-center text-[14.5px] leading-relaxed text-sub-2">
                    아직 올라온 나눔이 없어요.{"\n"}첫 나눔을 올려보세요.
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
