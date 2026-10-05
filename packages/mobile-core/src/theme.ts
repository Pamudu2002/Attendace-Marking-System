import { useColorScheme } from "react-native";

/** Shared colour tokens for both apps (light + dark). */
const light = {
  bg: "#F5F6F8",
  card: "#FFFFFF",
  text: "#14171F",
  muted: "#5F6675",
  border: "#E2E5EB",
  primary: "#2B5BD7",
  primaryText: "#FFFFFF",
  good: "#1E8E5A",
  warn: "#B7791F",
  bad: "#C53030",
  goodBg: "#E6F4EC",
  warnBg: "#FDF3E1",
  badBg: "#FBE9E9",
  neutralBg: "#EEF0F4",
};

const dark: typeof light = {
  bg: "#0F1115",
  card: "#1A1D24",
  text: "#ECEEF2",
  muted: "#A0A6B4",
  border: "#2B2F39",
  primary: "#7B9BFF",
  primaryText: "#0F1115",
  good: "#4CC38A",
  warn: "#F0B54C",
  bad: "#F27272",
  goodBg: "#163325",
  warnBg: "#3A2C12",
  badBg: "#3B1A1A",
  neutralBg: "#252934",
};

export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16 };
