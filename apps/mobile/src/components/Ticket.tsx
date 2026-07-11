import { Text, View } from "react-native";

interface TicketProps {
  amountLabel: string;
  label: string;
  muted?: boolean;
  /** 노치(구멍) 색은 티켓이 올라앉는 배경색과 같아야 "뚫린" 것처럼 보인다. */
  notchColor?: string;
}

// ttangttang-prototype.html .ticket — 절취선(점선) + 위아래 노치가 있는 "낙찰 티켓" 태그.
export function Ticket({ amountLabel, label, muted, notchColor = "#FFFFFF" }: TicketProps) {
  return (
    <View
      className={`relative min-w-[64px] items-center justify-center rounded-[10px] py-2.5 pl-4 pr-3 ${
        muted ? "bg-[#B0B8C1]" : "bg-brand"
      }`}
    >
      <View
        className="absolute bottom-1.5 top-1.5 left-[7px] border-l-[1.5px]"
        style={{ borderLeftColor: "rgba(255,255,255,0.45)", borderStyle: "dashed" }}
      />
      <View
        className="absolute -top-1 left-[3.5px] h-2 w-2 rounded-full"
        style={{ backgroundColor: notchColor }}
      />
      <View
        className="absolute -bottom-1 left-[3.5px] h-2 w-2 rounded-full"
        style={{ backgroundColor: notchColor }}
      />
      <Text className="tabular-nums text-[15px] font-extrabold tracking-tight text-white">
        {amountLabel}
      </Text>
      <Text className="mt-0.5 text-[10px] font-semibold tracking-wide text-white opacity-75">
        {label}
      </Text>
    </View>
  );
}
