import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Pressable, Text } from "react-native";
import { Banner, Body, Button, Card, errorMessage, Field, H1, Screen, usePalette } from "@attendance/mobile-core";
import { useAuth } from "@/lib/auth";
import { getApiUrl, setApiUrl } from "@/lib/config";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const c = usePalette();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getApiUrl().then(setServer);
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await setApiUrl(server || null);
      if (mode === "login") await login(email.trim(), password);
      else await register(fullName.trim(), email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
      <Screen>
        <H1>NFC Attendance</H1>
        <Body muted>Lecturer app: your phone reads students' phones to record attendance.</Body>
        <Card>
          {mode === "register" ? <Field label="Full name" value={fullName} onChangeText={setFullName} /> : null}
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          {mode === "register" ? <Body muted>At least 8 characters.</Body> : null}
          {error ? <Banner tone="bad">{error}</Banner> : null}
          <Button title={mode === "login" ? "Sign in" : "Create account"} onPress={submit} loading={busy} />
          <Pressable onPress={() => setMode(mode === "login" ? "register" : "login")} style={{ alignItems: "center", padding: 8 }}>
            <Text style={{ color: c.primary, fontWeight: "600" }}>
              {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
            </Text>
          </Pressable>
        </Card>
        <Card>
          <Field label="Server URL" value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" />
          <Body muted>Use your laptop's LAN address (e.g. http://192.168.1.20:3000) or a tunnel URL.</Body>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
