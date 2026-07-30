import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { StartPriceSegment } from "@/components/StartPriceSegment";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { StartPrice } from "@ttangttang/shared";

export default function PostScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startPrice, setStartPrice] = useState<StartPrice>(1000);
  const [pickupSlots, setPickupSlots] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);

  function updatePickupSlot(index: number, value: string) {
    setPickupSlots((prev) => prev.map((slot, i) => (i === index ? value : slot)));
  }
  function addPickupSlot() {
    setPickupSlots((prev) => (prev.length >= 4 ? prev : [...prev, ""]));
  }
  function removePickupSlot(index: number) {
    setPickupSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-[15px] leading-relaxed text-sub">
          나눔을 올리려면 먼저 로그인해주세요.
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

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    if (!trimmedTitle) {
      Alert.alert("물건 이름을 입력해주세요");
      return;
    }
    if (!trimmedDescription) {
      Alert.alert("설명을 입력해주세요");
      return;
    }
    const trimmedSlots = pickupSlots.map((s) => s.trim()).filter(Boolean);
    if (trimmedSlots.length === 0) {
      Alert.alert("방문 가능한 시간을 최소 1개 입력해주세요");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("items").insert({
        seller_id: session!.user.id,
        title: trimmedTitle,
        description: trimmedDescription,
        start_price: startPrice,
        pickup_slots: trimmedSlots,
        neighborhood: "행당동", // TODO(Phase 2 후속): 프로필/기기 위치 기반 동네 선택 UI
      });
      if (error) throw error;
      setTitle("");
      setDescription("");
      setStartPrice(1000);
      setPickupSlots([""]);
      router.replace("/");
    } catch (err) {
      Alert.alert("등록에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="px-3 pb-2.5 pt-3.5">
        <Text className="px-2 text-[17px] font-bold tracking-tight text-ink">나눔 올리기</Text>
      </View>
      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="mb-2 text-[13.5px] font-semibold text-sub">사진</Text>
        <View className="h-[84px] w-[84px] items-center justify-center gap-1 rounded-xl border border-dashed border-line">
          <Feather name="camera" size={20} color="#8B95A1" />
          <Text className="text-xs font-medium text-sub-2">0/5</Text>
        </View>

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">물건 이름</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="예) 이케아 협탁, 거의 새 거"
          placeholderTextColor="#AEB5BD"
          className="rounded-xl border border-line px-4 py-3.5 text-[15.5px] text-ink"
        />

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">
          시작가 — 지원자들이 이 가격 이상으로 제시해요
        </Text>
        <StartPriceSegment value={startPrice} onChange={setStartPrice} />

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">
          방문 가능 시간 (1~4개) — 지원자가 이 중에서 골라요
        </Text>
        {pickupSlots.map((slot, index) => (
          <View key={index} className="mb-2 flex-row items-center gap-2">
            <TextInput
              value={slot}
              onChangeText={(v) => updatePickupSlot(index, v)}
              placeholder={`예) ${index === 0 ? "오늘 저녁 7시 이후" : "내일 오전 10~12시"}`}
              placeholderTextColor="#AEB5BD"
              className="flex-1 rounded-xl border border-line px-4 py-3.5 text-[15.5px] text-ink"
            />
            {pickupSlots.length > 1 && (
              <Pressable
                onPress={() => removePickupSlot(index)}
                className="h-11 w-11 items-center justify-center rounded-xl active:bg-line-soft"
              >
                <Feather name="x" size={18} color="#8B95A1" />
              </Pressable>
            )}
          </View>
        ))}
        {pickupSlots.length < 4 && (
          <Pressable
            onPress={addPickupSlot}
            className="mt-1 h-11 flex-row items-center justify-center gap-1.5 rounded-xl border border-dashed border-line active:bg-line-soft"
          >
            <Feather name="plus" size={16} color="#6B7684" />
            <Text className="text-[13.5px] font-semibold text-sub">시간 추가</Text>
          </Pressable>
        )}

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">설명</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="상태, 사용 기간을 적어주세요"
          placeholderTextColor="#AEB5BD"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          className="h-[100px] rounded-xl border border-line px-4 py-3.5 text-[15.5px] leading-relaxed text-ink"
        />

        <View className="mt-5 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
          <Text className="text-[13px] leading-relaxed text-sub">
            지원서가 오면 <Text className="font-semibold text-ink-2">제시 금액과 방문 시간, 메시지, 수령률</Text>을
            보고 마음에 드는 이웃을 고르세요. 수락하는 순간 결제까지 끝나고, 노쇼가 나면 결제금 전액이
            위약금으로 들어와요.
          </Text>
        </View>
      </ScrollView>
      <View className="border-t border-line-soft bg-white px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          className="h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[16.5px] font-bold tracking-tight text-white">
            {submitting ? "올리는 중…" : "이 시작가로 올리기"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
