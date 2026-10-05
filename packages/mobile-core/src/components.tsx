import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { radius, spacing, usePalette } from "./theme";

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
}) {
  const c = usePalette();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: c.bg }]}>{children}</View>;
  return (
    <ScrollView
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.screen}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = usePalette();
  const body = <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function H1({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[styles.h1, { color: c.text }]}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  const c = usePalette();
  return <Text style={[styles.h2, { color: c.text }]}>{children}</Text>;
}

export function Body({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: object }) {
  const c = usePalette();
  return <Text style={[styles.body, { color: muted ? c.muted : c.text }, style]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = usePalette();
  const bg = variant === "primary" ? c.primary : variant === "danger" ? c.bad : c.neutralBg;
  const fg = variant === "secondary" ? c.text : c.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const c = usePalette();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...props}
        style={[styles.input, { color: c.text, borderColor: error ? c.bad : c.border, backgroundColor: c.card }]}
      />
      {error ? <Text style={{ color: c.bad, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
}

export type Tone = "good" | "warn" | "bad" | "neutral";

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const c = usePalette();
  const map = {
    good: [c.goodBg, c.good],
    warn: [c.warnBg, c.warn],
    bad: [c.badBg, c.bad],
    neutral: [c.neutralBg, c.muted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

export function Banner({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const c = usePalette();
  const bg = { good: c.goodBg, warn: c.warnBg, bad: c.badBg, neutral: c.neutralBg }[tone];
  const fg = { good: c.good, warn: c.warn, bad: c.bad, neutral: c.text }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 14, lineHeight: 20 }}>{children}</Text>
    </View>
  );
}

export function StatTile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: Tone }) {
  const c = usePalette();
  const color = tone === "bad" ? c.bad : tone === "warn" ? c.warn : tone === "good" ? c.good : c.text;
  return (
    <View style={[styles.tile, { backgroundColor: c.card, borderColor: c.border }]}>
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color, fontSize: 24, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{value}</Text>
      {sub ? <Text style={{ color: c.muted, fontSize: 12 }}>{sub}</Text> : null}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap: spacing.sm }, style]}>{children}</View>;
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  const c = usePalette();
  return (
    <View style={{ alignItems: "center", padding: spacing.xl, gap: spacing.xs }}>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: "600" }}>{title}</Text>
      {hint ? <Text style={{ color: c.muted, textAlign: "center" }}>{hint}</Text> : null}
    </View>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: c.bg }}>
      <ActivityIndicator color={c.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  card: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.sm },
  h1: { fontSize: 24, fontWeight: "700" },
  h2: { fontSize: 17, fontWeight: "600" },
  body: { fontSize: 15, lineHeight: 21 },
  button: { borderRadius: radius.sm, paddingVertical: 12, paddingHorizontal: spacing.lg, alignItems: "center", minHeight: 46, justifyContent: "center" },
  buttonText: { fontSize: 16, fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "500" },
  input: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" },
  banner: { borderRadius: radius.sm, padding: spacing.md },
  tile: { flex: 1, minWidth: 140, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: spacing.md, gap: 2 },
});
