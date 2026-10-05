import { Pressable, Text, View } from "react-native";
import { usePalette } from "@attendance/mobile-core";

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: "row", backgroundColor: c.neutralBg, borderRadius: 10, padding: 3 }}>
      {options.map((o) => (
        <Pressable
          key={o}
          accessibilityRole="tab"
          accessibilityState={{ selected: o === value }}
          onPress={() => onChange(o)}
          style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: o === value ? c.card : "transparent" }}
        >
          <Text style={{ color: o === value ? c.text : c.muted, fontWeight: "600" }}>{o}</Text>
        </Pressable>
      ))}
    </View>
  );
}
