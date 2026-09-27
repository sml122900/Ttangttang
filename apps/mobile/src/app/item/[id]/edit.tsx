import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { PickupDeadlineSegment, type PickupDeadlineHours } from "@/components/PickupDeadlineSegment";
import { useAuth } from "@/lib/auth";
import { cancelItem, fetchItemDetail, updateItem, type ItemDetail } from "@/lib/items";
import { pickPhoto, uploadItemPhoto } from "@/lib/photos";
import { won } from "@/lib/format";

// 4단계 — 매물 수정·삭제. 시작가는 편집 화면에 표시만 하고 입력을 막는다(items_start_price_immutable
// 트리거가 DB에서도 막는다, §0 규칙 1 신뢰 보호). "삭제"는 물리적 삭제가 아니라 취소(cancelled) —
// 이미 지원서를 낸 이웃이 있을 수 있어 기록은 남긴다.
export default function ItemEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pickupSlots, setPickupSlots] = useState<string[]>([""]);
  const [pickupDeadlineHours, setPickupDeadlineHours] = useState<PickupDeadlineHours>(24);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchItemDetail(id)
      .then((data) => {
        if (cancelled || !data) return;
        setItem(data);
        setTitle(data.title);
        setDescription(data.description);
        setPickupSlots(data.pickupSlots.length ? data.pickupSlots : [""]);
        setPickupDeadlineHours(data.pickupDeadlineHours as PickupDeadlineHours);
        setPhotoUrl(data.photos[0] ?? null);
        setPhotoUri(data.photos[0] ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  function updatePickupSlot(index: number, value: string) {
    setPickupSlots((prev) => prev.map((slot, i) => (i === index ? value : slot)));
  }
  function addPickupSlot() {
    setPickupSlots((prev) => (prev.length >= 4 ? prev : [...prev, ""]));
  }
  function removePickupSlot(index: number) {
    setPickupSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  async function handlePickPhoto() {
    if (!session) return;
    try {
      const uri = await pickPhoto();
      if (!uri) return;
      setPhotoUri(uri);
      setUploadingPhoto(true);
      const url = await uploadItemPhoto(session.user.id, uri);
      setPhotoUrl(url);
    } catch (err) {
      Alert.alert("사진을 불러오지 못했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSave() {
    if (!item) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedSlots = pickupSlots.map((s) => s.trim()).filter(Boolean);
    if (!trimmedTitle || !trimmedDescription || trimmedSlots.length === 0) {
      Alert.alert("빈 칸을 채워주세요");
      return;
    }
    setSaving(true);
    try {
      await updateItem(item.id, {
        title: trimmedTitle,
        description: trimmedDescription,
        pickupSlots: trimmedSlots,
        pickupDeadlineHours,
        photos: photoUrl ? [photoUrl] : [],
      });
      router.back();
    } catch (err) {
      Alert.alert("저장에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!item) return;
    Alert.alert("이 매물을 삭제할까요?", "대기 중인 지원서는 모두 거절 처리돼요. 되돌릴 수 없어요.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제하기",
        style: "destructive",
        onPress: async () => {
          setDeleting(true);
          try {
            await cancelItem(item.id);
            router.replace("/(tabs)/trades");
          } catch (err) {
            Alert.alert("삭제에 실패했어요", err instanceof Error ? err.message : String(err));
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  if (loading || !item) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-warm" edges={["top"]}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (session?.user.id !== item.sellerId) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-sm text-sub-2">내 매물만 수정할 수 있어요.</Text>
      </SafeAreaView>
    );
  }

  if (item.status !== "live") {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-sm text-sub-2">진행 중인 매물만 수정할 수 있어요.</Text>
      </SafeAreaView>
    );
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
        <Text className="text-[17px] font-bold tracking-tight text-ink">매물 관리</Text>
      </View>

      <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20, paddingBottom: 32 }}>
        <Text className="mb-2 text-[13.5px] font-semibold text-sub">사진</Text>
        <Pressable
          onPress={handlePickPhoto}
          disabled={uploadingPhoto}
          className="h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-xl border border-dashed border-line"
        >
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} className="h-full w-full" resizeMode="cover" />
              {uploadingPhoto && (
                <View className="absolute inset-0 items-center justify-center bg-black/40">
                  <ActivityIndicator color="#fff" size="small" />
                </View>
              )}
            </>
          ) : (
            <>
              <Feather name="camera" size={20} color="#8B95A1" />
              <Text className="mt-1 text-xs font-medium text-sub-2">추가</Text>
            </>
          )}
        </Pressable>

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">물건 이름</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholderTextColor="#AEB5BD"
          className="rounded-xl border border-line px-4 py-3.5 text-[15.5px] text-ink"
        />

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">시작가</Text>
        <View className="flex-row items-center justify-between rounded-xl bg-[#F9FAFB] px-4 py-3.5">
          <Text className="tabular-nums text-[15.5px] font-semibold text-ink-2">{won(item.startPrice)}</Text>
          <Text className="text-xs text-sub-2">등록 후에는 바꿀 수 없어요</Text>
        </View>

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">방문 가능 시간 (1~4개)</Text>
        {pickupSlots.map((slot, index) => (
          <View key={index} className="mb-2 flex-row items-center gap-2">
            <TextInput
              value={slot}
              onChangeText={(v) => updatePickupSlot(index, v)}
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

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">수령시한</Text>
        <PickupDeadlineSegment value={pickupDeadlineHours} onChange={setPickupDeadlineHours} />

        <Text className="mb-2 mt-5 text-[13.5px] font-semibold text-sub">설명</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholderTextColor="#AEB5BD"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          className="h-[100px] rounded-xl border border-line px-4 py-3.5 text-[15.5px] leading-relaxed text-ink"
        />

        <Pressable onPress={handleDelete} disabled={deleting} className="mt-8 h-11 items-center justify-center">
          <Text className="text-[13.5px] font-semibold text-danger">
            {deleting ? "삭제하는 중…" : "이 매물 삭제하기"}
          </Text>
        </Pressable>
      </ScrollView>

      <View className="border-t border-line-soft bg-white px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={handleSave}
          disabled={saving || uploadingPhoto}
          className="h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[16.5px] font-bold tracking-tight text-white">
            {saving ? "저장하는 중…" : "저장하기"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
