import { Text, View } from "react-native";
import { won } from "@/lib/format";

interface AuctionStripProps {
  startPrice: number;
  topOfferPrice: number | null;
  applicantCount: number;
}

// ttangttang-prototype.html .auction — 시작가 / 현재 최고 / 지원 n명, 3분할 스트립.
export function AuctionStrip({ startPrice, topOfferPrice, applicantCount }: AuctionStripProps) {
  const cells = [
    { key: "시작가", value: won(startPrice), hi: false },
    {
      key: "현재 최고",
      value: applicantCount > 0 ? won(topOfferPrice ?? startPrice) : "—",
      hi: applicantCount > 0,
    },
    { key: "지원", value: `${applicantCount}명`, hi: false },
  ];

  return (
    <View className="mx-5 mt-4 flex-row rounded-card border border-line bg-white">
      {cells.map((cell, i) => (
        <View
          key={cell.key}
          className={`flex-1 items-center py-3.5 ${i > 0 ? "border-l border-line-soft" : ""}`}
        >
          <Text className="text-[11.5px] font-medium text-sub-2">{cell.key}</Text>
          <Text
            className={`tabular-nums mt-1 text-base font-extrabold tracking-tight ${
              cell.hi ? "text-brand" : "text-ink"
            }`}
          >
            {cell.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
