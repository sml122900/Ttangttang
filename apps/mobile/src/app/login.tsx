import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useAuth } from "@/lib/auth";

export default function LoginScreen() {
  const { signInWithKakao, signInWithEmail } = useAuth();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleKakaoLogin() {
    setLoading(true);
    try {
      await signInWithKakao();
      router.replace("/");
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
      router.replace("/");
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

        {__DEV__ && (
          <View className="mb-6 gap-2.5 rounded-2xl border border-line bg-white p-4">
            <Text className="text-xs font-semibold text-sub-2">
              개발용 — 카카오 설정 전 테스트 계정 로그인 (프로덕션 빌드에는 없어요)
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="test@ttangttang.local"
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
              <Text className="text-sm font-bold text-white">
                {loading ? "로그인 중…" : "이메일로 로그인 (개발용)"}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          onPress={handleKakaoLogin}
          disabled={loading}
          className="mb-10 h-14 items-center justify-center rounded-2xl bg-[#FEE500] active:opacity-80"
        >
          <Text className="text-base font-bold tracking-tight text-[#191919]">
            {loading ? "로그인 중…" : "카카오로 시작하기"}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
