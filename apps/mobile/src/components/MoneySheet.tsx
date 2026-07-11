import type { ReactNode } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface MoneySheetProps {
  visible: boolean;
  onClose?: () => void;
  children: ReactNode;
}

// §5 돈 레지스터 — 카드 등록·동의·수락 확인 등 결제 관련 바텀시트의 공통 틀.
// (ttangttang-prototype.html .sheet/.dim 참고. 위트 금지, 흰 배경, 절제된 여백.)
export function MoneySheet({ visible, onClose, children }: MoneySheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable className="absolute inset-0 bg-black/50" onPress={onClose} />
        <View
          className="rounded-t-[22px] bg-white px-6 pt-2.5"
          style={{ paddingBottom: insets.bottom + 22 }}
        >
          <View className="mx-auto mb-4 h-1 w-9 rounded-full bg-line" />
          {children}
        </View>
      </View>
    </Modal>
  );
}
