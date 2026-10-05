/// <reference types="node" />
import fs from "node:fs";
import type { ExpoConfig } from "expo/config";

// Put the Firebase config for package lk.attendance.student here to enable FCM reminders.
const googleServicesFile = fs.existsSync("./google-services.json") ? "./google-services.json" : undefined;

const config: ExpoConfig = {
  name: "Attendance",
  slug: "attendance-student",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: "attendance-student",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "lk.attendance.student",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: ["android.permission.NFC", "android.permission.POST_NOTIFICATIONS"],
    ...(googleServicesFile ? { googleServicesFile } : {}),
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    ["expo-notifications", { defaultChannel: "reminders" }],
  ],
  extra: {
    // Default backend URL; can be changed in the app's Settings tab (e.g. your laptop's LAN IP or a tunnel).
    apiUrl: process.env.EXPO_PUBLIC_API_URL || "https://attendance-backend-steel.vercel.app",
  },
};

export default config;
