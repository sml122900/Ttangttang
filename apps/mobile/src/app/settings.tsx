import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { MoneySheet } from "@/components/MoneySheet";
import { deleteAccount, signOutAfterDeletion } from "@/lib/account";
import { useAuth } from "@/lib/auth";
import { deleteBillingKey, getMyCardInfo, openCardRegistration, type MyCardInfo } from "@/lib/billing";
import { openLegalPage } from "@/lib/legal";
import { fetchMyBlocks, unblockUser, type BlockedUserRow } from "@/lib/safety";

// 3단계 — 계정 설정. §5 아이콘 최소주의(탭바 3종 + 뒤로가기 + 상태 체크 외 금지) 때문에
// 탭으로 만들지 않았다 — (tabs)/trades.tsx 상단의 텍스트 링크("설정")로만 들어온다.
export default function SettingsScreen() {
  const { session, signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [blocks, setBlocks] = useState<BlockedUserRow[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [card, setCard] = useState<MyCardInfo | null | undefined>(undefined);
  const [registeringCard, setRegisteringCard] = useState(false);
  const [deletingCard, setDeletingCard] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadBlocks = useCallback(async () => {
    try {
      setBlocks(await fetchMyBlocks());
    } catch {
      // 차단 목록은 부가 정보라 실패해도 화면을 막지 않는다.
    } finally {
      setLoadingBlocks(false);
    }
  }, []);

  const loadCard = useCallback(async () => {
    try {
      setCard(await getMyCardInfo());
    } catch {
      setCard(null);
    }
  }, []);

  useEffect(() => {
    loadBlocks();
    loadCard();
  }, [loadBlocks, loadCard]);

  async function handleUnblock(row: BlockedUserRow) {
    try {
      await unblockUser(row.blockedId);
      setBlocks((prev) => prev.filter((b) => b.blockedId !== row.blockedId));
    } catch (err) {
      Alert.alert("차단 해제에 실패했어요", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCardRegister() {
    if (!session) return;
    setRegisteringCard(true);
    try {
      const result = await openCardRegistration(session.access_token);
      if (!result.ok) {
        Alert.alert("카드 등록이 완료되지 않았어요", "다시 시도해주세요.");
        return;
      }
      Alert.alert("카드가 등록됐어요");
      await loadCard();
    } catch (err) {
      Alert.alert("카드 등록 중 오류가 발생했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setRegisteringCard(false);
    }
  }

  function handleDeleteCard() {
    Alert.alert("등록된 카드를 삭제할까요?", "삭제하면 새 지원을 하기 전에 카드를 다시 등록해야 해요.", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제하기",
        style: "destructive",
        onPress: async () => {
          setDeletingCard(true);
          try {
            await deleteBillingKey();
            setCard(null);
          } catch (err) {
            Alert.alert("카드 삭제에 실패했어요", err instanceof Error ? err.message : String(err));
          } finally {
            setDeletingCard(false);
          }
        },
      },
    ]);
  }

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  async function handleConfirmDelete() {
    if (!session) return;
    setDeleting(true);
    try {
      const result = await deleteAccount(session.access_token);
      if (!result.ok) {
        Alert.alert("탈퇴에 실패했어요", result.error ?? "다시 시도해주세요.");
        return;
      }
      await signOutAfterDeletion();
      setDeleteSheetOpen(false);
      router.replace("/login");
      Alert.alert("탈퇴가 완료됐어요", "그동안 이용해주셔서 감사했어요.");
    } catch (err) {
      Alert.alert("탈퇴에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
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
        <Text className="text-[17px] font-bold tracking-tight text-ink">설정</Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Text className="px-5 pb-2.5 pt-3.5 text-[13px] font-semibold text-sub-2">결제</Text>
        <View className="mx-5 mb-3 rounded-card border border-line bg-white px-4 py-4">
          {card === undefined ? (
            <ActivityIndicator size="small" />
          ) : card ? (
            <>
              <Text className="text-[14.5px] font-semibold text-ink">
                {card.cardCompany ?? "등록된 카드"} {card.cardNumberMasked ?? ""}
              </Text>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={handleCardRegister}
                  disabled={registeringCard || deletingCard}
                  className="h-10 flex-1 items-center justify-center rounded-xl border border-line active:bg-line-soft"
                >
                  {registeringCard ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text className="text-[13.5px] font-semibold text-ink-2">카드 변경</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={handleDeleteCard}
                  disabled={registeringCard || deletingCard}
                  className="h-10 flex-1 items-center justify-center rounded-xl border border-line active:bg-line-soft"
                >
                  {deletingCard ? (
                    <ActivityIndicator size="small" />
                  ) : (
                    <Text className="text-[13.5px] font-semibold text-danger">카드 삭제</Text>
                  )}
                </Pressable>
              </View>
            </>
          ) : (
            <Pressable
              onPress={handleCardRegister}
              disabled={registeringCard}
              className="flex-row items-center justify-between"
            >
              <Text className="text-[14.5px] font-semibold text-ink">등록된 카드가 없어요 — 등록하기</Text>
              {registeringCard ? <ActivityIndicator size="small" /> : <Feather name="chevron-right" size={18} color="#8B95A1" />}
            </Pressable>
          )}
        </View>

        <Text className="px-5 pb-2.5 pt-3.5 text-[13px] font-semibold text-sub-2">차단 관리</Text>
        <View className="mx-5 mb-3 rounded-card border border-line bg-white px-4 py-2">
          {loadingBlocks ? (
            <View className="py-4">
              <ActivityIndicator size="small" />
            </View>
          ) : blocks.length === 0 ? (
            <Text className="py-3.5 text-[13.5px] text-sub-2">차단한 이웃이 없어요.</Text>
          ) : (
            blocks.map((b, i) => (
              <View
                key={b.blockedId}
                className={`flex-row items-center justify-between py-3 ${i > 0 ? "border-t border-line-soft" : ""}`}
              >
                <Text className="text-[14.5px] text-ink-2">{b.nickname}</Text>
                <Pressable onPress={() => handleUnblock(b)}>
                  <Text className="text-[13px] font-semibold text-sub underline">차단 해제</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text className="px-5 pb-2.5 pt-3.5 text-[13px] font-semibold text-sub-2">약관</Text>
        <View className="mx-5 mb-3 rounded-card border border-line bg-white px-4 py-2">
          <Pressable onPress={() => openLegalPage("/terms")} className="border-b border-line-soft py-3.5">
            <Text className="text-[14.5px] text-ink-2">이용약관</Text>
          </Pressable>
          <Pressable onPress={() => openLegalPage("/privacy")} className="py-3.5">
            <Text className="text-[14.5px] text-ink-2">개인정보처리방침</Text>
          </Pressable>
        </View>

        <Text className="px-5 pb-2.5 pt-3.5 text-[13px] font-semibold text-sub-2">계정</Text>
        <View className="mx-5 mb-3 rounded-card border border-line bg-white px-4 py-2">
          <Pressable onPress={handleSignOut} className="border-b border-line-soft py-3.5">
            <Text className="text-[14.5px] text-ink-2">로그아웃</Text>
          </Pressable>
          <Pressable onPress={() => setDeleteSheetOpen(true)} className="py-3.5">
            <Text className="text-[14.5px] font-semibold text-danger">계정 삭제</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* ---------- 계정 삭제 확인 (돈 레지스터 — billing_keys 삭제를 포함하는 돌이킬 수 없는 결정) ---------- */}
      <MoneySheet visible={deleteSheetOpen} onClose={() => (deleting ? undefined : setDeleteSheetOpen(false))}>
        <Text className="text-lg font-bold tracking-tight text-ink">계정을 삭제할까요?</Text>
        <View className="mt-4 rounded-xl bg-[#F9FAFB] px-3.5 py-3">
          <Text className="text-[13px] leading-relaxed text-sub">
            등록된 카드 정보가 삭제되고 로그인 수단이 사라져요. 닉네임 등 개인 정보는 지워지고
            거래 상대에게는 <Text className="font-semibold text-ink-2">"탈퇴한 사용자"</Text>로 표시돼요.
            법령에 따라 보존이 필요한 거래·결제 기록은 별도 보관됩니다.{"\n\n"}
            진행 중인(결제 완료 후 아직 수령 전인) 거래가 있으면 삭제할 수 없어요.
          </Text>
        </View>
        <Pressable
          onPress={handleConfirmDelete}
          disabled={deleting}
          className="mt-5 h-[54px] items-center justify-center rounded-2xl bg-danger active:opacity-90 disabled:opacity-60"
        >
          <Text className="text-[16px] font-bold text-white">{deleting ? "삭제하는 중…" : "네, 삭제할게요"}</Text>
        </Pressable>
        <Pressable
          onPress={() => setDeleteSheetOpen(false)}
          disabled={deleting}
          className="mt-2.5 h-11 items-center justify-center rounded-2xl active:bg-line-soft"
        >
          <Text className="text-[14px] font-semibold text-sub">취소</Text>
        </Pressable>
      </MoneySheet>
    </SafeAreaView>
  );
}
