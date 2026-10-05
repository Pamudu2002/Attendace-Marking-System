/// <reference types="node" />
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "Attendance Host",
  slug: "attendance-host",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "attendance-host",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "lk.attendance.host",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["android.permission.NFC", "android.permission.VIBRATE"],
  },
  plugins: ["expo-router", "expo-secure-store", "expo-sqlite", "expo-sharing", "@react-native-community/datetimepicker"],
  extra: {
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://attendance-backend-steel.vercel.app",
  },
};

export default config;
