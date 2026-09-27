import { Pressable, Text, View } from "react-native";

const OPTIONS = [24, 48, 72] as const;
export type PickupDeadlineHours = (typeof OPTIONS)[number];

interface PickupDeadlineSegmentProps {
  value: PickupDeadlineHours;
  onChange: (hours: PickupDeadlineHours) => void;
}

// 4단계 — 등록 화면 수령시한 입력. 낙찰 순간부터 이 시간 안에 수령하지 않으면 노쇼로
// 처리된다(§0 규칙 5) — post.tsx / item/[id]/edit.tsx가 공유한다.
export function PickupDeadlineSegment({ value, onChange }: PickupDeadlineSegmentProps) {
  return (
    <View className="flex-row gap-2">
      {OPTIONS.map((hours) => {
        const selected = hours === value;
        return (
          <Pressable
            key={hours}
            onPress={() => onChange(hours)}
            className={`h-11 flex-1 items-center justify-center rounded-xl border ${
              selected ? "border-brand bg-brand-tint" : "border-line bg-white"
            }`}
          >
            <Text className={`text-[13.5px] font-semibold ${selected ? "text-brand" : "text-ink-2"}`}>
              {hours}시간 이내
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
