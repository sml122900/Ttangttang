import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { MoneySheet } from "@/components/MoneySheet";
import { openCardRegistration } from "@/lib/billing";
import { hasBillingKey, submitApplication } from "@/lib/applications";
import { useAuth } from "@/lib/auth";
import { fetchItemDetail, type ItemDetail } from "@/lib/items";
import { won } from "@/lib/format";

type SheetStep = "closed" | "card" | "consent" | "applied";

export default function ApplyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [offer, setOffer] = useState(1000);
  const [visitTime, setVisitTime] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sheet, setSheet] = useState<SheetStep>("closed");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchItemDetail(id)
      .then((data) => {
        if (cancelled) return;
        setItem(data);
        if (data) setOffer(data.startPrice);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-[15px] leading-relaxed text-sub">
          지원서를 쓰려면 먼저 로그인해주세요.
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

  if (loading || !item) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-warm">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  function updateOffer(next: number) {
    if (!item) return;
    setOffer(Math.max(item.startPrice, next));
  }

  function handleSubmitPress() {
    if (!visitTime) {
      Alert.alert("방문 가능 시간을 골라주세요");
      return;
    }
    setBusy(true);
    hasBillingKey()
      .then((has) => setSheet(has ? "consent" : "card"))
      .catch((err) => Alert.alert("확인에 실패했어요", err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
  }

  async function handleCardRegisterPress() {
    setBusy(true);
    try {
      const result = await openCardRegistration(session!.access_token);
      if (!result.ok) {
        Alert.alert("카드 등록이 완료되지 않았어요", "다시 시도해주세요.");
        return;
      }
      setSheet("consent");
    } catch (err) {
      Alert.alert("카드 등록 중 오류가 발생했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmApplyPress() {
    setBusy(true);
    try {
      await submitApplication({
        itemId: item!.id,
        applicantId: session!.user.id,
        offerPrice: offer,
        visitTime: visitTime!,
        message: message.trim(),
      });
      setSheet("applied");
    } catch (err) {
      Alert.alert("지원에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const hint =
    item.applicantCount > 0
      ? `현재 최고 ${won(item.topOfferPrice ?? item.startPrice)} · 시작가 그대로도 지원할 수 있어요`
      : "아직 지원자가 없어요 — 시작가 그대로도 충분해요";

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-3 pb-2.5 pt-3.5">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl active:bg-line-soft"
        >
          <Feather name="arrow-left" size={22} color="#191F28" />
        </Pressable>
        <Text className="text-[17px] font-bold tracking-tight text-ink">지원서 쓰기</Text>
      </View>

      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="mb-2 text-[13.5px] font-semibold text-sub">제시 금액</Text>
        <View className="items-center rounded-2xl border border-line px-4 py-4.5">
          <Text className="text-center text-xs text-sub-2">{hint}</Text>
          <View className="mt-2.5 flex-row items-center gap-4">
            <Pressable
              onPress={() => updateOffer(offer - 1000)}
              disabled={offer <= item.startPrice}
              className="h-11 w-11 items-center justify-center rounded-full border border-line active:bg-line-soft disabled:opacity-40"
            >
              <Text className="text-xl font-semibold text-ink-2">−</Text>
            </Pressable>
            <Text className="tabular-nums min-w-[130px] text-center text-[28px] font-extrabold tracking-tight text-ink">
              {won(offer)}
            </Text>
            <Pressable
              onPress={() => updateOffer(offer + 1000)}
              className="h-11 w-11 items-center justify-center rounded-full border border-line active:bg-line-soft"
            >
              <Text className="text-xl font-semibold text-ink-2">＋</Text>
            </Pressable>
          </View>
          <Text className="mt-1.5 text-xs text-sub-2">시작가 {won(item.startPrice)}부터</Text>
        </View>

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">방문 가능 시간</Text>
        <View className="flex-row flex-wrap gap-2">
          {item.pickupSlots.map((t) => {
            const selected = visitTime === t;
            return (
              <Pressable
                key={t}
                onPress={() => setVisitTime(t)}
                className={`rounded-full border px-3.5 py-2.5 ${
                  selected ? "border-brand bg-brand-tint" : "border-line bg-white"
                }`}
              >
                <Text className={`text-[13.5px] font-medium ${selected ? "font-semibold text-brand" : "text-ink-2"}`}>
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">한 줄 메시지 (선택)</Text>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder="예) 바로 앞 살아서 5분이면 가요"
          placeholderTextColor="#AEB5BD"
          className="rounded-xl border border-line px-4 py-3.5 text-[15.5px] text-ink"
        />

        <View className="mt-5 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
          <Text className="text-[13px] leading-relaxed text-sub">
            지원서 제출은 <Text className="font-semibold text-ink-2">무료</Text>예요. 판매자가 수락하는
            순간에만 제시 금액이 등록된 카드에서 결제되고,{" "}
            <Text className="font-semibold text-ink-2">낙찰 후에는 취소할 수 없어요.</Text>
          </Text>
        </View>
      </ScrollView>

      <View className="border-t border-line-soft bg-white px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={handleSubmitPress}
          disabled={busy}
          className="h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[16.5px] font-bold tracking-tight text-white">지원서 내기</Text>
        </Pressable>
      </View>

      {/* ---------- 카드 등록 (돈 레지스터) ---------- */}
      <MoneySheet visible={sheet === "card"} onClose={() => setSheet("closed")}>
        <Text className="text-lg font-bold tracking-tight text-ink">결제 카드를 등록해주세요</Text>
        <Text className="mt-1.5 text-sm leading-relaxed text-sub">
          처음 한 번만 등록하면 다음부턴 지원서만 쓰면 돼요.
        </Text>
        <View className="mt-4 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
          <Text className="text-[13px] leading-relaxed text-sub">
            지금은 카드 등록만 하고 <Text className="font-semibold text-ink-2">결제되지 않아요.</Text>{" "}
            낙찰 순간에만 제시 금액이 결제됩니다.
          </Text>
        </View>
        <Pressable
          onPress={handleCardRegisterPress}
          disabled={busy}
          className="mt-5 h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[16px] font-bold text-white">
            {busy ? "이동 중…" : "이 카드 등록하기"}
          </Text>
        </Pressable>
      </MoneySheet>

      {/* ---------- 동의 (돈 레지스터) ---------- */}
      <MoneySheet visible={sheet === "consent"} onClose={() => setSheet("closed")}>
        <Text className="text-lg font-bold tracking-tight text-ink">이 조건으로 지원할게요</Text>
        <View className="mt-4">
          <View className="flex-row justify-between py-2">
            <Text className="text-[14.5px] text-sub">제시 금액</Text>
            <Text className="tabular-nums text-[14.5px] font-semibold text-ink">{won(offer)}</Text>
          </View>
          <View className="flex-row justify-between py-2">
            <Text className="text-[14.5px] text-sub">방문 가능</Text>
            <Text className="text-[14.5px] font-semibold text-ink">{visitTime}</Text>
          </View>
          <View className="flex-row justify-between border-t border-line-soft pt-3.5">
            <Text className="text-[14.5px] font-semibold text-ink">낙찰 시 결제금액</Text>
            <Text className="tabular-nums text-lg font-extrabold text-brand">{won(offer)}</Text>
          </View>
        </View>
        <View className="mt-4 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
          <Text className="text-[13px] leading-relaxed text-sub">
            판매자가 수락하면 <Text className="font-semibold text-ink-2">등록된 카드에서 즉시 결제</Text>
            되며 <Text className="font-semibold text-ink-2">취소할 수 없어요.</Text> 약속 시간 내
            미수령 시 결제금 전액이 위약금으로 판매자에게 지급됩니다.
          </Text>
        </View>
        <Pressable
          onPress={handleConfirmApplyPress}
          disabled={busy}
          className="mt-5 h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[16px] font-bold text-white">
            {busy ? "제출 중…" : "동의하고 지원하기"}
          </Text>
        </Pressable>
      </MoneySheet>

      {/* ---------- 완료 ---------- */}
      <MoneySheet visible={sheet === "applied"} onClose={() => router.replace(`/item/${item.id}`)}>
        <View className="items-center px-2 pb-2">
          <View className="mb-4 h-[60px] w-[60px] items-center justify-center rounded-full bg-point-tint">
            <Feather name="check" size={28} color="#0BA05C" />
          </View>
          <Text className="text-lg font-bold tracking-tight text-ink">지원서를 냈어요</Text>
          <Text className="mt-2 text-center text-[14.5px] leading-relaxed text-sub">
            판매자가 수락하면 낙찰 알림과 함께 결제가 진행돼요.{"\n"}수락 전까지는 거래 탭에서 철회할
            수 있어요.
          </Text>
          <Pressable
            onPress={() => router.replace(`/item/${item.id}`)}
            className="mt-5 h-[54px] w-full items-center justify-center rounded-2xl bg-brand active:bg-brand-press"
          >
            <Text className="text-[16px] font-bold text-white">확인</Text>
          </Pressable>
        </View>
      </MoneySheet>
    </SafeAreaView>
  );
}
