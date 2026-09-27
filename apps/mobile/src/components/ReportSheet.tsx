import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { blockUser, submitReport, type ReportTargetType } from "@/lib/safety";

const REASONS = ["부적절한 내용", "사기 의심", "욕설·괴롭힘", "기타"];

interface ReportSheetProps {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  /** 함께 차단할 대상이 있을 때만(예: 지원자, 채팅 상대). 없으면 "차단하기" 섹션을 숨긴다. */
  blockTarget?: { userId: string; nickname: string };
  onBlocked?: () => void;
}

// §5 2-레지스터: 신고·차단은 돈이 오가는 행위가 아니라 동네 레지스터에 속한다 — MoneySheet를
// 그대로 쓰지 않고 별도 시트로 둔다. 다만 진지한 결정이라 위트는 넣지 않는다("탈락 알림"과
// 같은 톤 — 담백하게).
export function ReportSheet({ visible, onClose, targetType, targetId, blockTarget, onBlocked }: ReportSheetProps) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [blocking, setBlocking] = useState(false);

  function reset() {
    setReason(null);
    setDetail("");
  }

  async function handleSubmitReport() {
    if (!reason) {
      Alert.alert("신고 사유를 골라주세요");
      return;
    }
    setSubmitting(true);
    try {
      await submitReport({ targetType, targetId, reason, detail: detail.trim() });
      Alert.alert("신고가 접수됐어요", "확인 후 조치할게요.");
      reset();
      onClose();
    } catch (err) {
      Alert.alert("신고에 실패했어요", err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleBlockPress() {
    if (!blockTarget) return;
    Alert.alert(`${blockTarget.nickname} 님을 차단할까요?`, "차단하면 서로의 매물이 피드에 보이지 않고, 서로 지원할 수 없어요.", [
      { text: "취소", style: "cancel" },
      {
        text: "차단하기",
        style: "destructive",
        onPress: async () => {
          setBlocking(true);
          try {
            await blockUser(blockTarget.userId);
            Alert.alert("차단했어요");
            onBlocked?.();
            onClose();
          } catch (err) {
            Alert.alert("차단에 실패했어요", err instanceof Error ? err.message : String(err));
          } finally {
            setBlocking(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} />
        <View className="rounded-t-[22px] bg-white px-6 pt-2.5" style={{ paddingBottom: insets.bottom + 22 }}>
          <View className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />
          <Text className="text-lg font-bold tracking-tight text-ink">신고하기</Text>

          <View className="mt-4 gap-2">
            {REASONS.map((r) => {
              const selected = reason === r;
              return (
                <Pressable
                  key={r}
                  onPress={() => setReason(r)}
                  className={`rounded-xl border px-4 py-3 ${selected ? "border-brand bg-brand-tint" : "border-line"}`}
                >
                  <Text className={`text-[14.5px] ${selected ? "font-semibold text-brand" : "text-ink-2"}`}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            value={detail}
            onChangeText={setDetail}
            placeholder="자세히 알려주시면 더 정확히 확인할 수 있어요 (선택)"
            placeholderTextColor="#AEB5BD"
            multiline
            className="mt-3 min-h-[64px] rounded-xl border border-line px-4 py-3 text-[14.5px] text-ink"
          />

          <Pressable
            onPress={handleSubmitReport}
            disabled={submitting}
            className="mt-4 h-[52px] items-center justify-center rounded-2xl bg-ink active:opacity-80 disabled:opacity-60"
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text className="text-[15px] font-bold text-white">신고 제출</Text>}
          </Pressable>

          {blockTarget && (
            <>
              <View className="my-4 h-px bg-line-soft" />
              <Pressable
                onPress={handleBlockPress}
                disabled={blocking}
                className="h-11 items-center justify-center rounded-xl active:bg-line-soft disabled:opacity-60"
              >
                <Text className="text-[14px] font-semibold text-danger">
                  {blocking ? "차단하는 중…" : `${blockTarget.nickname} 님 차단하기`}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
