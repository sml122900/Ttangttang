import { Pressable, Text, View } from "react-native";
import { START_PRICE_DESCRIPTIONS, START_PRICES, type StartPrice } from "@ttangttang/shared";
import { won } from "@/lib/format";

interface StartPriceSegmentProps {
  value: StartPrice;
  onChange: (price: StartPrice) => void;
}

// ttangttang-prototype.html .seg — §0 규칙 1: 시작가 3택 고정.
export function StartPriceSegment({ value, onChange }: StartPriceSegmentProps) {
  return (
    <View className="flex-row gap-2">
      {START_PRICES.map((price) => {
        const selected = price === value;
        return (
          <Pressable
            key={price}
            onPress={() => onChange(price)}
            className={`h-[76px] flex-1 items-center justify-center gap-1 rounded-2xl border-[1.5px] ${
              selected ? "border-brand bg-brand-tint" : "border-line bg-white"
            }`}
          >
            <Text
              className={`tabular-nums text-[17.5px] font-extrabold tracking-tight ${
                selected ? "text-brand" : "text-ink"
              }`}
            >
              {won(price)}
            </Text>
            <Text className={`text-[11.5px] font-medium ${selected ? "text-brand/75" : "text-sub-2"}`}>
              {START_PRICE_DESCRIPTIONS[price]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
