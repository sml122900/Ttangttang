import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";

const STEPS = [
  {
    n: "1",
    title: "낙찰 순간 결제가 끝나요",
    desc: "판매자가 지원서를 수락하면 그 즉시 등록된 카드로 결제돼요. 구매자는 취소할 수 없어요.",
  },
  {
    n: "2",
    title: "약속한 시간 안에 수령하면 끝",
    desc: "판매자와 정한 수령시한 안에 물건을 받으면, 서로 채팅에서 확인 버튼만 누르면 거래가 마무리돼요.",
  },
  {
    n: "3",
    title: "시간을 넘기면 노쇼 보장이 작동해요",
    desc: "수령시한을 넘기면 결제금 전액이 자동으로 판매자에게 위약금으로 지급돼요. 판매자는 손해 볼 일이 없어요.",
  },
];

// PROJECT.md §5 — 신뢰 장치는 "에어커버"처럼 독립 네이밍·독립 화면으로 둔다. item/[id].tsx의
// "이 거래가 안전한 이유"에서 들어온다.
export default function GuaranteeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-surface-warm" edges={["top"]}>
      <View className="flex-row items-center gap-2 px-3 pb-2.5 pt-3.5">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-xl active:bg-line-soft"
        >
          <Feather name="arrow-left" size={22} color="#191F28" />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <View className="mb-6 h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint">
          <Text className="text-[15px] font-extrabold text-brand">보장</Text>
        </View>
        <Text className="text-2xl font-bold tracking-tight text-ink">땅땅 노쇼 보장</Text>
        <Text className="mt-2 text-[15px] leading-relaxed text-sub">
          찜하고 잠수, 약속 어기고 연락 두절 — 땅땅에서는 일어나지 않아요.{"\n"}
          결제가 낙찰 순간 끝나기 때문에, 노쇼는 판매자의 손해가 아니라 구매자의 위약금으로 끝나요.
        </Text>

        <View className="mt-8">
          {STEPS.map((step) => (
            <View key={step.n} className="flex-row gap-3 py-3">
              <View className="mt-0.5 h-7 w-7 items-center justify-center rounded-full bg-brand-tint">
                <Text className="text-xs font-bold text-brand">{step.n}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold tracking-tight text-ink">{step.title}</Text>
                <Text className="mt-1 text-[13.5px] leading-relaxed text-sub">{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="mt-6 rounded-xl bg-white px-4 py-3.5">
          <Text className="text-[13px] leading-relaxed text-sub">
            수령시한은 매물마다 판매자가 정해요(24 / 48 / 72시간). 채팅에서 구매자·판매자 둘 다
            "수령했어요" 확인을 눌러야 거래가 완료돼요 — 한쪽만 눌러선 끝나지 않아요.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
