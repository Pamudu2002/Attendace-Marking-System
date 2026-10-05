import { Pressable, Text, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { fmtDay, fmtTime, radius, spacing, usePalette } from "@attendance/mobile-core";

/** Tappable field opening the native Android date or time picker. */
export function DateTimeField({ label, value, mode, onChange }: { label: string; value: Date; mode: "date" | "time"; onChange: (d: Date) => void }) {
  const c = usePalette();
  return (
    <View style={{ gap: spacing.xs, flex: 1 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: "500" }}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          DateTimePickerAndroid.open({
            value,
            mode,
            is24Hour: true,
            onChange: (event, date) => {
              if (event.type === "set" && date) onChange(date);
            },
          })
        }
        style={{ borderWidth: 1, borderColor: c.border, borderRadius: radius.sm, padding: spacing.md, backgroundColor: c.card }}
      >
        <Text style={{ color: c.text, fontSize: 16 }}>{mode === "date" ? fmtDay(value) : fmtTime(value)}</Text>
      </Pressable>
    </View>
  );
}
