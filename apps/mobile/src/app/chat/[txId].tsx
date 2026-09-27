import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { ReportSheet } from "@/components/ReportSheet";
import {
  confirmPickup,
  fetchChatTransaction,
  fetchMessages,
  sendMessage,
  subscribeToMessages,
  type ChatMessage,
  type ChatTransaction,
} from "@/lib/chat";
import { useAuth } from "@/lib/auth";

export default function ChatScreen() {
  const { txId } = useLocalSearchParams<{ txId: string }>();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [tx, setTx] = useState<ChatTransaction | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!session || !txId) return;
    let cancelled = false;
    Promise.all([fetchChatTransaction(txId, session.user.id), fetchMessages(txId)])
      .then(([txData, msgs]) => {
        if (cancelled) return;
        setTx(txData);
        setMessages(msgs);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const unsubscribe = subscribeToMessages(txId, (message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [txId, session]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !session || !txId || sending) return;
    setSending(true);
    setDraft("");
    try {
      await sendMessage(txId, session.user.id, body);
    } catch (err) {
      setDraft(body);
      Alert.alert("전송에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  // 4단계 — 수령 확인(구매자 확인 + 판매자 확인 이중 체크). 둘 다 확인하면 서버에서 completed로
  // 전이한다 — 여기서는 성공 후 tx를 다시 불러와 최신 상태(상대방 확인 여부·완료 여부)를 반영한다.
  async function handleConfirm() {
    if (!txId || confirming) return;
    setConfirming(true);
    try {
      await confirmPickup(txId);
      const fresh = await fetchChatTransaction(txId, session!.user.id);
      setTx(fresh);
    } catch (err) {
      Alert.alert("확인에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setConfirming(false);
    }
  }

  if (!session) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-surface-warm px-8" edges={["top"]}>
        <Text className="text-center text-[15px] leading-relaxed text-sub">
          채팅을 보려면 먼저 로그인해주세요.
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

  if (loading || !tx) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-surface-warm" edges={["top"]}>
        {loading ? <ActivityIndicator /> : <Text className="text-sm text-sub-2">채팅방을 찾을 수 없어요</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center gap-2 border-b border-line-soft bg-white px-3 pb-2.5 pt-3.5">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl active:bg-line-soft"
        >
          <Feather name="arrow-left" size={22} color="#191F28" />
        </Pressable>
        <View className="flex-1">
          <Text className="text-[16px] font-bold tracking-tight text-ink">{tx.counterparty.nickname}</Text>
          <Text numberOfLines={1} className="text-xs text-sub-2">
            {tx.itemTitle}
          </Text>
        </View>
        <Pressable onPress={() => setReportOpen(true)} hitSlop={8} className="px-1">
          <Text className="text-[12px] font-medium text-sub-2 underline">신고</Text>
        </Pressable>
      </View>

      <PickupConfirmationBanner tx={tx} selfId={session.user.id} confirming={confirming} onConfirm={handleConfirm} />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="text-center text-[13.5px] leading-relaxed text-sub-2">
                아직 대화가 없어요.{"\n"}수령 시간을 먼저 정해보세요.
              </Text>
            </View>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === session.user.id;
              return (
                <View
                  key={m.id}
                  className={`mb-2 max-w-[78%] ${mine ? "self-end items-end" : "self-start items-start"}`}
                >
                  <View
                    className={`rounded-2xl px-3.5 py-2.5 ${mine ? "bg-brand" : "border border-line bg-white"}`}
                  >
                    <Text className={`text-[14.5px] leading-relaxed ${mine ? "text-white" : "text-ink"}`}>
                      {m.body}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View
          className="flex-row items-end gap-2 border-t border-line-soft bg-white px-4 pt-2.5"
          style={{ paddingBottom: insets.bottom + 10 }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="메시지 보내기"
            placeholderTextColor="#AEB5BD"
            multiline
            className="max-h-24 flex-1 rounded-2xl border border-line px-4 py-2.5 text-[14.5px] text-ink"
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !draft.trim()}
            className="h-10 w-10 items-center justify-center rounded-full bg-brand active:bg-brand-press disabled:opacity-40"
          >
            <Feather name="arrow-up" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={tx.counterparty.id}
        blockTarget={{ userId: tx.counterparty.id, nickname: tx.counterparty.nickname }}
      />
    </SafeAreaView>
  );
}

// §5 돈 레지스터 — 수령 확인은 거래의 마지막 단계라 위트 없이 건조하게. 구매자/판매자
// 양쪽 확인이 모두 있어야 completed로 넘어간다(§3, confirm_pickup() RPC가 서버에서 강제).
function PickupConfirmationBanner({
  tx,
  selfId,
  confirming,
  onConfirm,
}: {
  tx: ChatTransaction;
  selfId: string;
  confirming: boolean;
  onConfirm: () => void;
}) {
  if (tx.status === "completed") {
    return (
      <View className="border-b border-line-soft bg-point-tint px-4 py-3">
        <Text className="text-[13px] font-semibold text-point">거래가 완료됐어요. 수고하셨어요!</Text>
      </View>
    );
  }
  if (tx.status === "noshow_settled") {
    return (
      <View className="border-b border-line-soft bg-danger/10 px-4 py-3">
        <Text className="text-[13px] font-semibold text-danger">
          약속 시간 내 수령하지 않아 노쇼로 정산됐어요.
        </Text>
      </View>
    );
  }

  const isBuyer = selfId === tx.buyerId;
  const myConfirmedAt = isBuyer ? tx.buyerConfirmedAt : tx.sellerConfirmedAt;
  const counterpartyConfirmedAt = isBuyer ? tx.sellerConfirmedAt : tx.buyerConfirmedAt;
  const deadlineText = new Date(tx.pickupDeadline).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View className="border-b border-line-soft bg-white px-4 py-3">
      <Text className="text-[12.5px] text-sub">{deadlineText}까지 수령 확인이 필요해요</Text>
      {myConfirmedAt ? (
        <Text className="mt-1.5 text-[13px] font-semibold text-sub-2">
          {counterpartyConfirmedAt ? "확인 완료" : "확인했어요 — 상대방 확인을 기다리는 중"}
        </Text>
      ) : (
        <Pressable
          onPress={onConfirm}
          disabled={confirming}
          className="mt-2 h-10 items-center justify-center rounded-xl bg-brand active:bg-brand-press disabled:opacity-60"
        >
          <Text className="text-[13.5px] font-bold text-white">
            {confirming ? "확인하는 중…" : isBuyer ? "물건을 수령했어요" : "물건을 전달했어요"}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
