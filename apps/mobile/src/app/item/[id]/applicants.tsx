import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { AwardStamp } from "@/components/AwardStamp";
import { MoneySheet } from "@/components/MoneySheet";
import { acceptApplication, fetchApplicants, type ApplicantRow } from "@/lib/applications";
import { useAuth } from "@/lib/auth";
import { fetchItemDetail, type ItemDetail } from "@/lib/items";
import { won } from "@/lib/format";

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  accepted: { label: "낙찰 · 결제 완료", className: "bg-point-tint text-point" },
  rejected: { label: "거절 알림 발송됨", className: "bg-line-soft text-sub-2" },
  payment_failed: { label: "결제 실패", className: "bg-danger/10 text-danger" },
};

export default function ApplicantsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [applicants, setApplicants] = useState<ApplicantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<ApplicantRow | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [awarded, setAwarded] = useState<ApplicantRow | null>(null);
  const [awardedTxId, setAwardedTxId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [itemData, applicantsData] = await Promise.all([fetchItemDetail(id), fetchApplicants(id)]);
    setItem(itemData);
    setApplicants(applicantsData);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-[15px] leading-relaxed text-sub">먼저 로그인해주세요.</Text>
        <Pressable
          onPress={() => router.push("/login")}
          className="h-12 items-center justify-center rounded-2xl bg-brand px-6"
        >
          <Text className="text-[15px] font-bold text-white">로그인하기</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (loading || !item) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-warm">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const pendingOffers = applicants.filter((a) => a.status === "pending").map((a) => a.offerPrice);
  const maxOffer = pendingOffers.length ? Math.max(...pendingOffers) : 0;

  async function handleAcceptConfirm() {
    if (!target || !session) return;
    setAccepting(true);
    try {
      const result = await acceptApplication(target.applicationId, session.access_token);
      if (!result.ok) {
        Alert.alert("수락 실패", result.error ?? "다시 시도해주세요.");
        return;
      }
      setAwarded(target);
      setAwardedTxId(result.transactionId ?? null);
      setTarget(null);
      await load();
    } catch (err) {
      // 네트워크 오류 — 서버에서는 처리됐을 수도 있으니 목록을 다시 불러와 실제 상태를 보여준다 (§4 P7).
      Alert.alert(
        "수락 결과를 확인하지 못했어요",
        "네트워크 상태를 확인해주세요. 목록을 새로 불러올게요.",
      );
      setTarget(null);
      await load().catch(() => {});
    } finally {
      setAccepting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-3 pb-2.5 pt-3.5">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl active:bg-line-soft"
        >
          <Feather name="arrow-left" size={22} color="#191F28" />
        </Pressable>
        <Text className="text-[17px] font-bold tracking-tight text-ink">지원서 {applicants.length}건</Text>
      </View>
      <Text className="px-5 pb-2.5 pt-1 text-[13px] font-semibold text-sub-2">
        {item.title} · 시작가 {won(item.startPrice)}
      </Text>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        {applicants.length === 0 ? (
          <View className="items-center px-10 py-16">
            <Text className="mb-3 text-4xl">🎫</Text>
            <Text className="text-center text-[14.5px] leading-relaxed text-sub-2">
              아직 지원서가 없어요.
            </Text>
          </View>
        ) : (
          applicants.map((a) => {
            const plus = a.offerPrice - item.startPrice;
            const isBest = a.status === "pending" && item.status === "live" && a.offerPrice === maxOffer;
            const statusChip = STATUS_CHIP[a.status];
            return (
              <View
                key={a.applicationId}
                className={`relative mx-5 mb-3 rounded-card border bg-white p-4 ${
                  isBest ? "border-brand" : "border-line"
                }`}
              >
                {isBest && (
                  <View className="absolute -top-2.5 left-3.5 rounded-md bg-brand px-2 py-0.5">
                    <Text className="text-[11px] font-bold text-white">최고 제시</Text>
                  </View>
                )}
                <View className="flex-row items-center gap-2.5">
                  <View className="h-[38px] w-[38px] items-center justify-center rounded-full bg-brand-tint">
                    <Text className="text-[15px] font-bold text-brand">
                      {a.applicant.nickname.slice(0, 1)}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[14.5px] font-semibold tracking-tight text-ink">
                      {a.applicant.nickname}
                    </Text>
                    <Text className="mt-0.5 text-xs text-sub-2">
                      수령률 <Text className="font-bold text-point">{a.applicant.receiveRate}%</Text> · 거래{" "}
                      {a.applicant.tradeCount}회
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="tabular-nums text-[19px] font-extrabold tracking-tight text-ink">
                      {won(a.offerPrice)}
                    </Text>
                    <Text className={`text-[11px] font-bold ${plus > 0 ? "text-brand" : "text-sub-2"}`}>
                      {plus > 0 ? `시작가 +${won(plus)}` : "시작가 그대로"}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 border-t border-line-soft pt-3">
                  <View className="flex-row gap-2 py-0.5">
                    <Text className="w-16 text-[13.5px] text-sub-2">방문 가능</Text>
                    <Text className="flex-1 text-[13.5px] leading-relaxed text-ink-2">{a.visitTime}</Text>
                  </View>
                  {a.message ? (
                    <View className="flex-row gap-2 py-0.5">
                      <Text className="w-16 text-[13.5px] text-sub-2">메시지</Text>
                      <Text className="flex-1 text-[13.5px] leading-relaxed text-ink-2">{a.message}</Text>
                    </View>
                  ) : null}
                </View>

                {a.status === "pending" && item.status === "live" ? (
                  <Pressable
                    onPress={() => setTarget(a)}
                    className="mt-3.5 h-11 items-center justify-center rounded-xl bg-brand active:bg-brand-press"
                  >
                    <Text className="text-[14.5px] font-bold text-white">이 이웃에게 낙찰</Text>
                  </Pressable>
                ) : statusChip ? (
                  <View className="mt-3.5 self-start rounded-md px-2 py-1">
                    <Text className={`rounded-md px-2 py-[3px] text-xs font-semibold ${statusChip.className}`}>
                      {statusChip.label}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ---------- 수락 확인 (돈 레지스터) ---------- */}
      <MoneySheet visible={!!target} onClose={() => (accepting ? undefined : setTarget(null))}>
        {target && (
          <>
            <Text className="text-lg font-bold tracking-tight text-ink">이 지원서를 수락할까요?</Text>
            <View className="mt-4">
              <View className="flex-row justify-between py-2">
                <Text className="text-[14.5px] text-sub">낙찰자</Text>
                <Text className="text-[14.5px] font-semibold text-ink">{target.applicant.nickname}</Text>
              </View>
              <View className="flex-row justify-between py-2">
                <Text className="text-[14.5px] text-sub">방문 가능</Text>
                <Text className="text-[14.5px] font-semibold text-ink">{target.visitTime}</Text>
              </View>
              <View className="flex-row justify-between border-t border-line-soft pt-3.5">
                <Text className="text-[14.5px] font-semibold text-ink">받을 금액</Text>
                <Text className="tabular-nums text-lg font-extrabold text-brand">
                  {won(target.offerPrice)}
                </Text>
              </View>
            </View>
            <View className="mt-4 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
              <Text className="text-[13px] leading-relaxed text-sub">
                수락하는 순간 <Text className="font-semibold text-ink-2">낙찰자의 카드에서 즉시 결제</Text>
                되고, 나머지 지원서에는 <Text className="font-semibold text-ink-2">자동으로 거절 알림</Text>
                이 나가요. 이 결정은 되돌릴 수 없어요.
              </Text>
            </View>
            <Pressable
              onPress={handleAcceptConfirm}
              disabled={accepting}
              className="mt-5 h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
            >
              <Text className="text-[16px] font-bold text-white">
                {accepting ? "낙찰자 카드에서 결제 중…" : "땅땅 치고 낙찰 확정"}
              </Text>
            </Pressable>
          </>
        )}
      </MoneySheet>

      {/* ---------- 낙찰 확정 (땅땅 더블 노크) ---------- */}
      <MoneySheet
        visible={!!awarded}
        onClose={() => {
          setAwarded(null);
          setAwardedTxId(null);
          router.back();
        }}
      >
        {awarded && (
          <View className="items-center pb-2">
            <AwardStamp amount={awarded.offerPrice} toLabel={`${awarded.applicant.nickname} 님 · 결제 완료`} />
            <Text className="mt-4 text-center text-[14.5px] leading-relaxed text-ink-2">
              결제가 완료됐어요. 낙찰자와 채팅으로{"\n"}수령 시간을 확정해주세요.
            </Text>
            {awardedTxId && (
              <Pressable
                onPress={() => {
                  const chatTxId = awardedTxId;
                  setAwarded(null);
                  setAwardedTxId(null);
                  router.replace({ pathname: "/chat/[txId]", params: { txId: chatTxId } });
                }}
                className="mt-5 h-[54px] w-full items-center justify-center rounded-2xl bg-point active:bg-[#088A4F]"
              >
                <Text className="text-[16px] font-bold text-white">채팅하기</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                setAwarded(null);
                setAwardedTxId(null);
                router.back();
              }}
              className="mt-2.5 h-11 w-full items-center justify-center rounded-2xl active:bg-line-soft"
            >
              <Text className="text-[14px] font-semibold text-sub">나중에 할게요</Text>
            </Pressable>
          </View>
        )}
      </MoneySheet>
    </SafeAreaView>
  );
}
