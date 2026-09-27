import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";
import { openLegalPage } from "@/lib/legal";
import { needsOnboarding } from "@/lib/profile";
import { supabase } from "@/lib/supabase";

// 로그인 성공 직후 온보딩(닉네임/동네)을 마쳤는지 확인해 분기한다 — 신규 가입자만
// /onboarding으로 보내고, 기존 사용자는 곧장 홈으로.
async function routeAfterLogin() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (userId && (await needsOnboarding(userId))) {
    router.replace("/onboarding");
  } else {
    router.replace("/");
  }
}

export default function LoginScreen() {
  const { signInWithKakao, signInWithEmail } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleKakaoLogin() {
    setLoading(true);
    try {
      await signInWithKakao();
      await routeAfterLogin();
    } catch (err) {
      Alert.alert("로그인에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin() {
    setLoading(true);
    try {
      await signInWithEmail(email.trim(), password);
      await routeAfterLogin();
    } catch (err) {
      Alert.alert("로그인에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-warm px-6">
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View className="flex-1 items-center justify-center gap-3">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint">
            <Text className="text-base font-extrabold text-brand">땅땅</Text>
          </View>
          <Text className="mt-2 text-xl font-bold tracking-tight text-ink">
            입찰은 지원서로, 확정은 땅땅
          </Text>
          <Text className="text-center text-sm leading-relaxed text-sub">
            우리 동네 나눔·소액거래.{"\n"}봉은 판매자가 두드려요.
          </Text>
        </View>

        <Pressable
          onPress={handleKakaoLogin}
          disabled={loading}
          className="h-14 items-center justify-center rounded-2xl bg-[#FEE500] active:opacity-80"
        >
          <Text className="text-base font-bold tracking-tight text-[#191919]">
            {loading ? "로그인 중…" : "카카오로 시작하기"}
          </Text>
        </Pressable>

        {/* 카카오 계정이 없는 스토어 심사관용 경로 — 프로덕션에도 유지하되 기본은 숨겨둔다
            (docs/decisions.md 2026-09-27 사용자 결정). */}
        {!showEmailLogin ? (
          <Pressable onPress={() => setShowEmailLogin(true)} className="mt-4 items-center py-2">
            <Text className="text-[13px] font-medium text-sub-2 underline">다른 방법으로 로그인</Text>
          </Pressable>
        ) : (
          <View className="mt-4 gap-2.5 rounded-2xl border border-line bg-white p-4">
            <Text className="text-xs font-semibold text-sub-2">이메일로 로그인</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="이메일"
              placeholderTextColor="#AEB5BD"
              autoCapitalize="none"
              keyboardType="email-address"
              className="rounded-xl border border-line px-3.5 py-3 text-sm text-ink"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="비밀번호"
              placeholderTextColor="#AEB5BD"
              secureTextEntry
              autoCapitalize="none"
              className="rounded-xl border border-line px-3.5 py-3 text-sm text-ink"
            />
            <Pressable
              onPress={handleEmailLogin}
              disabled={loading || !email || !password}
              className="h-12 items-center justify-center rounded-xl bg-ink active:opacity-80 disabled:opacity-40"
            >
              <Text className="text-sm font-bold text-white">{loading ? "로그인 중…" : "이메일로 로그인"}</Text>
            </Pressable>
          </View>
        )}

        <View className="mb-8 mt-10 flex-row items-center justify-center gap-3">
          <Pressable onPress={() => openLegalPage("/terms")}>
            <Text className="text-xs font-medium text-sub-2 underline">이용약관</Text>
          </Pressable>
          <Text className="text-xs text-sub-2">·</Text>
          <Pressable onPress={() => openLegalPage("/privacy")}>
            <Text className="text-xs font-medium text-sub-2 underline">개인정보처리방침</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
