import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { completeOnboarding } from "@/lib/profile";
import { fetchCurrentNeighborhood, searchNeighborhoods } from "@/lib/location";

type Step = 1 | 2 | 3;

// 3단계 온보딩 — 로그인 직후 1회. §5 동네 레지스터(당근 문법 + 배민식 위트, 가볍게).
// 로그아웃 후 재로그인 시 needsOnboarding()이 다시 true를 주면 또 뜬다 — 별도 "몇 번째 로그인"
// 추적은 하지 않는다(스펙에 없음, 과설계 방지).
export default function OnboardingScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);
  const [nickname, setNickname] = useState("");
  const [neighborhood, setNeighborhood] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchAttempted, setSearchAttempted] = useState(false);
  const [finishing, setFinishing] = useState(false);

  async function handleUseLocation() {
    setLocating(true);
    try {
      const result = await fetchCurrentNeighborhood();
      if (!result.ok) {
        Alert.alert("위치로 찾지 못했어요", result.message);
        return;
      }
      setNeighborhood(result.neighborhood);
    } finally {
      setLocating(false);
    }
  }

  async function handleSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchAttempted(true);
    try {
      setSearchResults(await searchNeighborhoods(searchQuery.trim()));
    } catch {
      // 카카오 API 자체가 막혀 있어도(§ 미설정 등) 온보딩이 막히면 안 된다 — 검색 실패는
      // 조용히 "결과 없음"으로 취급하고, 아래 직접입력 폴백으로 이어지게 한다.
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleFinish() {
    if (!session || !neighborhood) return;
    setFinishing(true);
    try {
      await completeOnboarding(session.user.id, nickname.trim() || "이웃", neighborhood);
      router.replace("/");
    } catch (err) {
      Alert.alert("저장에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setFinishing(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-3 pb-2.5 pt-3.5">
        {step > 1 && (
          <Pressable
            onPress={() => setStep((s) => (s - 1) as Step)}
            className="h-10 w-10 items-center justify-center rounded-xl active:bg-line-soft"
          >
            <Feather name="arrow-left" size={22} color="#191F28" />
          </Pressable>
        )}
        <View className="ml-auto mr-2 flex-row gap-1.5">
          {[1, 2, 3].map((n) => (
            <View key={n} className={`h-1.5 w-6 rounded-full ${n <= step ? "bg-brand" : "bg-line-soft"}`} />
          ))}
        </View>
      </View>

      {step === 1 && (
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <Text className="text-5xl">🔔</Text>
          <Text className="text-center text-xl font-bold tracking-tight text-ink">
            땅땅에 오신 걸 환영해요
          </Text>
          <Text className="text-center text-[15px] leading-relaxed text-sub">
            지원서는 공짜, 결제는 낙찰 순간에만.{"\n"}
            판매자가 땅땅 치면 그 순간 끝나요.
          </Text>
        </View>
      )}

      {step === 2 && (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: "center" }}>
          <Text className="text-xl font-bold tracking-tight text-ink">뭐라고 불러드릴까요?</Text>
          <Text className="mt-2 text-[14px] leading-relaxed text-sub">
            이웃들에게 보이는 이름이에요. 나중에 바꿀 수 있어요.
          </Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="닉네임"
            placeholderTextColor="#AEB5BD"
            maxLength={20}
            className="mt-6 rounded-xl border border-line bg-white px-4 py-3.5 text-[16px] text-ink"
          />
        </ScrollView>
      )}

      {step === 3 && (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 24 }}>
          <Text className="text-xl font-bold tracking-tight text-ink">어느 동네에 사세요?</Text>
          <Text className="mt-2 text-[14px] leading-relaxed text-sub">
            같은 동네 이웃들과 매물을 주고받아요.
          </Text>

          <Pressable
            onPress={handleUseLocation}
            disabled={locating}
            className="mt-6 h-[54px] flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
          >
            {locating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Feather name="navigation" size={16} color="#fff" />
                <Text className="text-[15px] font-bold text-white">현재 위치로 자동 설정</Text>
              </>
            )}
          </Pressable>

          <Text className="mt-5 mb-2 text-[13px] font-semibold text-sub">또는 직접 검색</Text>
          <View className="flex-row gap-2">
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              placeholder="예) 행당동, 성수동"
              placeholderTextColor="#AEB5BD"
              className="flex-1 rounded-xl border border-line bg-white px-4 py-3 text-[15px] text-ink"
            />
            <Pressable
              onPress={handleSearch}
              disabled={searching}
              className="h-[46px] items-center justify-center rounded-xl bg-ink px-4 active:opacity-80 disabled:opacity-60"
            >
              {searching ? <ActivityIndicator size="small" color="#fff" /> : <Text className="text-[14px] font-bold text-white">검색</Text>}
            </Pressable>
          </View>

          {searchResults.length > 0 && (
            <View className="mt-3 gap-1.5">
              {searchResults.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => {
                    setNeighborhood(r);
                    setSearchResults([]);
                    setSearchQuery(r);
                  }}
                  className="rounded-xl border border-line bg-white px-4 py-3 active:bg-line-soft"
                >
                  <Text className="text-[14.5px] text-ink-2">{r}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* 검색 API가 결과를 못 주거나 실패해도(예: 위치 서비스 미설정) 온보딩이 막히지
              않도록, 입력한 텍스트를 그대로 동네로 쓸 수 있게 해둔다. */}
          {searchAttempted && !searching && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
            <Pressable
              onPress={() => setNeighborhood(searchQuery.trim())}
              className="mt-2 rounded-xl border border-dashed border-line px-4 py-3 active:bg-line-soft"
            >
              <Text className="text-[13.5px] text-sub">
                검색 결과가 없어요 — <Text className="font-semibold text-ink-2">'{searchQuery.trim()}'</Text>로 직접 설정
              </Text>
            </Pressable>
          )}

          {neighborhood && (
            <View className="mt-5 flex-row items-center gap-2 rounded-xl bg-brand-tint px-4 py-3.5">
              <Feather name="check-circle" size={16} color="#4059C8" />
              <Text className="text-[14.5px] font-semibold text-brand">{neighborhood}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <View className="border-t border-line-soft bg-white px-5 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Pressable
          onPress={() => {
            if (step === 3) {
              if (!neighborhood) {
                Alert.alert("동네를 설정해주세요");
                return;
              }
              handleFinish();
            } else {
              setStep((s) => (s + 1) as Step);
            }
          }}
          disabled={finishing}
          className="h-[54px] items-center justify-center rounded-2xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[16.5px] font-bold tracking-tight text-white">
            {finishing ? "저장하는 중…" : step === 3 ? "시작하기" : "다음"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
