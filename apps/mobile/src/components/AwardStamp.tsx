import { useEffect } from "react";
import { Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { won } from "@/lib/format";

interface AwardStampProps {
  amount: number;
  toLabel: string;
}

// ttangttang-prototype.html .award-ticket/.stamp/@keyframes stamp+knock — 판매자가 수락하는 순간
// "땅땅" 두 번 두드리는 시그니처 모션(§5). 스탬프가 두 번 내려찍히는 타이밍에 맞춰 햅틱도 2회 울린다.
export function AwardStamp({ amount, toLabel }: AwardStampProps) {
  const stampScale = useSharedValue(2.4);
  const stampRotate = useSharedValue(-14);
  const stampOpacity = useSharedValue(0);
  const ticketY = useSharedValue(0);
  const ticketRotate = useSharedValue(0);

  useEffect(() => {
    stampOpacity.value = withTiming(1, { duration: 240 });
    // 첫 번째 "땅"(240ms) → 튕김(140ms) → 두 번째 "땅"(150ms) → 튕김(140ms) → 정착(180ms)
    stampScale.value = withSequence(
      withTiming(0.88, { duration: 240 }),
      withTiming(1.3, { duration: 140 }),
      withTiming(0.9, { duration: 150 }),
      withTiming(1.06, { duration: 140 }),
      withTiming(1, { duration: 180 }),
    );
    stampRotate.value = withSequence(
      withTiming(-14, { duration: 240 }),
      withTiming(-11, { duration: 140 }),
      withTiming(-15, { duration: 150 }),
      withTiming(-13, { duration: 140 }),
      withTiming(-13, { duration: 180 }),
    );
    // 봉 맞은 티켓의 울림 — 스탬프가 내려찍히는 두 순간에 살짝 눌렸다 돌아온다.
    ticketY.value = withSequence(
      withTiming(0, { duration: 170 }),
      withTiming(3, { duration: 68 }),
      withTiming(-1, { duration: 102 }),
      withTiming(3, { duration: 238 }),
      withTiming(-1, { duration: 112 }),
      withTiming(0, { duration: 160 }),
    );
    ticketRotate.value = withSequence(
      withTiming(0, { duration: 170 }),
      withTiming(-0.8, { duration: 68 }),
      withTiming(0.3, { duration: 102 }),
      withTiming(0.8, { duration: 238 }),
      withTiming(-0.3, { duration: 112 }),
      withTiming(0, { duration: 160 }),
    );

    const knock1 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, 240);
    const knock2 = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    }, 530);
    return () => {
      clearTimeout(knock1);
      clearTimeout(knock2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stampStyle = useAnimatedStyle(() => ({
    opacity: stampOpacity.value,
    transform: [{ rotate: `${stampRotate.value}deg` }, { scale: stampScale.value }],
  }));
  const ticketStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: ticketY.value }, { rotate: `${ticketRotate.value}deg` }],
  }));

  return (
    <Animated.View style={ticketStyle} className="relative mx-auto mt-2 w-[230px] rounded-2xl bg-brand py-5 pl-8 pr-5">
      <View
        className="absolute bottom-3 top-3 left-3.5 border-l-2"
        style={{ borderLeftColor: "rgba(255,255,255,0.4)", borderStyle: "dashed" }}
      />
      <View className="absolute -top-1.5 left-2 h-3 w-3 rounded-full bg-surface-warm" />
      <View className="absolute -bottom-1.5 left-2 h-3 w-3 rounded-full bg-surface-warm" />
      <Text className="text-[11px] font-semibold tracking-wide text-white opacity-75">낙찰 티켓</Text>
      <Text className="tabular-nums mt-0.5 text-[28px] font-extrabold tracking-tight text-white">
        {won(amount)}
      </Text>
      <Text className="mt-1.5 text-xs text-white opacity-85">{toLabel}</Text>

      <Animated.View
        style={[stampStyle, { position: "absolute", right: -14, top: -16 }]}
        className="h-[76px] w-[76px] items-center justify-center rounded-full border-[3.5px] border-[#FF6B4A] bg-white/90"
      >
        <Text className="text-[15px] font-black tracking-wide text-[#FF6B4A]">땅땅</Text>
      </Animated.View>
    </Animated.View>
  );
}
