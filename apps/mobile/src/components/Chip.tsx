import { Text } from "react-native";

type ChipTone = "live" | "quiet" | "green" | "gray" | "red";

const TONE_CLASSES: Record<ChipTone, string> = {
  live: "bg-brand-tint text-brand",
  quiet: "bg-line-soft text-sub",
  green: "bg-point-tint text-point",
  gray: "bg-line-soft text-sub-2",
  red: "bg-danger/10 text-danger",
};

export function Chip({ tone, children }: { tone: ChipTone; children: string }) {
  const [bgClass, textClass] = TONE_CLASSES[tone].split(" ");
  return (
    <Text
      className={`self-start rounded-md px-2 py-[3px] text-xs font-semibold tracking-tight ${bgClass} ${textClass}`}
    >
      {children}
    </Text>
  );
}
