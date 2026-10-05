import { Text, type ColorValue } from "react-native";
import { Tabs } from "expo-router/tabs";
import { usePalette } from "@attendance/mobile-core";

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const c = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.card },
        headerTintColor: c.text,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Classes", tabBarIcon: icon("▤") }} />
      <Tabs.Screen name="experiment" options={{ title: "Experiment", tabBarIcon: icon("⧗") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: icon("⚙") }} />
    </Tabs>
  );
}
