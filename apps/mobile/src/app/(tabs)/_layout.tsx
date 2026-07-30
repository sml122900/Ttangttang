import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const INK = "#191F28";
const SUB2 = "#8B95A1";
const TAB_BAR_CONTENT_HEIGHT = 56;

// §5 아이콘 최소주의: 탭바 3종(홈 · 나눔 올리기 · 거래) 외에는 아이콘을 쓰지 않는다.
export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: INK,
        tabBarInactiveTintColor: SUB2,
        tabBarStyle: {
          borderTopColor: "#F2F4F6",
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "홈",
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="post"
        options={{
          title: "나눔 올리기",
          tabBarIcon: ({ color, size }) => <Feather name="plus-circle" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trades"
        options={{
          title: "거래",
          tabBarIcon: ({ color, size }) => <Feather name="clipboard" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
