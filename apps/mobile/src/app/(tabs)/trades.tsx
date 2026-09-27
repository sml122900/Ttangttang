import { useCallback, useEffect, useState } from "react";
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Chip } from "@/components/Chip";
import { fetchMyApplications, withdrawApplication, type MyApplicationRow } from "@/lib/applications";
import { useAuth } from "@/lib/auth";
import { fetchMyItems, type MyItemRow } from "@/lib/items";
import {
  fetchMyPurchaseTransactionsByApplicationId,
  fetchMySaleTransactions,
  type MySaleTransaction,
} from "@/lib/transactions";
import { won } from "@/lib/format";

const APP_STATUS_CHIP: Record<string, { label: string; tone: "quiet" | "gray" | "green" | "red" }> = {
  pending: { label: "판매자 검토 중", tone: "quiet" },
  withdrawn: { label: "철회함", tone: "gray" },
  accepted: { label: "낙찰", tone: "green" },
  rejected: { label: "이번엔 다른 이웃에게", tone: "gray" },
  payment_failed: { label: "결제 실패", tone: "red" },
};

export default function TradesScreen() {
  const { session } = useAuth();
  const [myItems, setMyItems] = useState<MyItemRow[]>([]);
  const [myApps, setMyApps] = useState<MyApplicationRow[]>([]);
  const [saleTx, setSaleTx] = useState<MySaleTransaction[]>([]);
  const [purchaseTxByAppId, setPurchaseTxByAppId] = useState<Map<string, string>>(new Map());
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    const [items, apps, tx, purchaseTx] = await Promise.all([
      fetchMyItems(session.user.id),
      fetchMyApplications(session.user.id),
      fetchMySaleTransactions(session.user.id),
      fetchMyPurchaseTransactionsByApplicationId(session.user.id),
    ]);
    setMyItems(items);
    setMyApps(apps);
    setSaleTx(tx);
    setPurchaseTxByAppId(purchaseTx);
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function handleWithdraw(applicationId: string) {
    setWithdrawingId(applicationId);
    try {
      await withdrawApplication(applicationId);
      await load();
    } catch (err) {
      Alert.alert("철회에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setWithdrawingId(null);
    }
  }

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-[15px] leading-relaxed text-sub">
          내 매물과 내 지원을 보려면 먼저 로그인해주세요.
        </Text>
        <Pressable
          onPress={() => router.push("/login")}
          className="h-12 items-center justify-center rounded-2xl bg-brand px-6"
        >
          <Text className="text-[15px] font-bold text-white">로그인하기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const saleTxByItemId = new Map(saleTx.map((t) => [t.itemId, t]));

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center justify-between px-5 pb-2.5 pt-3.5">
        <Text className="text-[19px] font-bold tracking-tight text-ink">거래</Text>
        <Pressable onPress={() => router.push("/settings")} hitSlop={8}>
          <Text className="text-[13px] font-semibold text-sub">설정</Text>
        </Pressable>
      </View>
      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="px-5 pb-2.5 pt-2 text-[13px] font-semibold text-sub-2">내 매물</Text>
        {myItems.length === 0 ? (
          <View className="items-center px-10 py-10">
            <Text className="mb-2 text-3xl">📦</Text>
            <Text className="text-center text-[13.5px] leading-relaxed text-sub-2">
              아직 올린 나눔이 없어요.
            </Text>
          </View>
        ) : (
          myItems.map((it) => {
            const tx = saleTxByItemId.get(it.id);
            const isLive = it.status === "live";
            return (
              <View key={it.id} className="mx-5 mb-3 rounded-card border border-line bg-white px-4 py-4">
                <View className="flex-row items-center gap-2.5">
                  <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-ink">
                    {it.title}
                  </Text>
                  <Chip tone={isLive ? "live" : tx ? "green" : "gray"}>
                    {isLive
                      ? `지원 ${it.applicantCount}건`
                      : tx
                        ? "낙찰 완료"
                        : it.status === "cancelled"
                          ? "취소됨"
                          : it.status}
                  </Chip>
                </View>
                {isLive ? (
                  <>
                    <Text className="tabular-nums mt-2 text-[13px] text-sub">
                      {it.applicantCount > 0 ? "현재 최고 제시가" : "시작가"}{" "}
                      {won(it.applicantCount > 0 ? (it.topOfferPrice ?? it.start_price) : it.start_price)}
                    </Text>
                    {it.applicantCount > 0 && (
                      <Pressable
                        onPress={() => router.push(`/item/${it.id}/applicants`)}
                        className="mt-3 h-11 items-center justify-center rounded-xl bg-brand-tint active:opacity-80"
                      >
                        <Text className="text-[13.5px] font-bold text-brand">
                          지원서 보고 낙찰자 고르기
                        </Text>
                      </Pressable>
                    )}
                  </>
                ) : tx ? (
                  <>
                    <View className="mt-2.5 flex-row items-baseline justify-between border-t border-line-soft pt-2.5">
                      <Text className="text-[13px] text-sub">받을 금액 ({tx.buyerNickname})</Text>
                      <Text className="tabular-nums text-base font-extrabold text-point">
                        +{won(tx.amount)}
                      </Text>
                    </View>
                    <Text className="mt-2 text-xs leading-relaxed text-sub-2">
                      수령이 완료되면 정산돼요. 노쇼 시에는 전액이 위약금으로 자동 지급됩니다.
                    </Text>
                    <Pressable
                      onPress={() => router.push({ pathname: "/chat/[txId]", params: { txId: tx.id } })}
                      className="mt-3 h-11 items-center justify-center rounded-xl bg-brand-tint active:opacity-80"
                    >
                      <Text className="text-[13.5px] font-bold text-brand">채팅하기</Text>
                    </Pressable>
                  </>
                ) : null}
              </View>
            );
          })
        )}

        <Text className="px-5 pb-2.5 pt-3.5 text-[13px] font-semibold text-sub-2">내 지원</Text>
        {myApps.length === 0 ? (
          <View className="items-center px-10 py-14">
            <Text className="mb-3 text-4xl">🎫</Text>
            <Text className="text-center text-[14.5px] leading-relaxed text-sub-2">
              아직 낸 지원서가 없어요.{"\n"}홈에서 마음에 드는 나눔에 지원해보세요.
            </Text>
          </View>
        ) : (
          myApps.map((a) => {
            const chip = APP_STATUS_CHIP[a.status];
            const chatTxId = a.status === "accepted" ? purchaseTxByAppId.get(a.id) : undefined;
            return (
              <View key={a.id} className="mx-5 mb-3 rounded-card border border-line bg-white px-4 py-4">
                <View className="flex-row items-center gap-2.5">
                  <Text numberOfLines={1} className="flex-1 text-[15px] font-semibold text-ink">
                    {a.itemTitle}
                  </Text>
                  {chip && <Chip tone={chip.tone}>{chip.label}</Chip>}
                </View>
                <View className="mt-2 flex-row items-baseline justify-between">
                  <Text className="text-[13px] text-sub">내 제시가 · {a.visitTime}</Text>
                  <Text className="tabular-nums text-[15px] font-bold text-ink">{won(a.offerPrice)}</Text>
                </View>
                {a.status === "pending" && (
                  <Pressable onPress={() => handleWithdraw(a.id)} disabled={withdrawingId === a.id}>
                    <Text className="mt-2.5 text-xs text-sub-2 underline">
                      {withdrawingId === a.id ? "철회하는 중…" : "지원 철회하기"}
                    </Text>
                  </Pressable>
                )}
                {chatTxId && (
                  <Pressable
                    onPress={() => router.push({ pathname: "/chat/[txId]", params: { txId: chatTxId } })}
                    className="mt-3 h-11 items-center justify-center rounded-xl bg-brand-tint active:opacity-80"
                  >
                    <Text className="text-[13.5px] font-bold text-brand">채팅하기</Text>
                  </Pressable>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
