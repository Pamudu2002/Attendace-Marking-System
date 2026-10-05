import { Pressable, Text, View } from "react-native";
import { usePalette } from "@attendance/mobile-core";

export function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  const c = usePalette();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: "500" }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const on = o === value;
          return (
            <Pressable
              key={o}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(on ? ("" as T) : o)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : c.card }}
            >
              <Text style={{ color: on ? c.primaryText : c.text, fontSize: 13 }}>{o}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
