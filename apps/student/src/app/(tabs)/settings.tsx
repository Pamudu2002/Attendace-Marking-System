import { useEffect, useState } from "react";
import { Alert } from "react-native";
import * as Application from "expo-application";
import { Badge, Body, Button, Card, Field, H2, Row, Screen } from "@attendance/mobile-core";
import { Hce } from "../../../modules/attendance-hce";
import { getApiUrl, setApiUrl } from "@/lib/config";
import { useAppState } from "@/lib/context";
import { resetIdentity } from "@/lib/identity";
import { useMe } from "@/lib/queries";

export default function SettingsScreen() {
  const { identity, push, reload } = useAppState();
  const me = useMe();
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const status = Hce.getStatus();

  useEffect(() => {
    getApiUrl().then(setUrl);
  }, []);

  return (
    <Screen>
      <Card>
        <H2>This phone</H2>
        <Line label="Student" value={me.data?.student ? `${me.data.student.fullName} (${me.data.student.indexNumber})` : "Not enrolled"} />
        <Line label="Device code" value={identity.deviceId.slice(0, 8).toUpperCase()} />
        <Line label="Key storage" value={identity.securityLevel} />
        <Line label="NFC" value={status.nfcEnabled ? "On" : status.nfcSupported ? "Off" : "Not supported"} />
        <Line label="Card emulation (HCE)" value={status.hceSupported ? "Supported" : "Not supported"} />
        <Line
          label="Reminders"
          value={!push ? "Setting up…" : !push.granted ? "Notifications blocked" : push.token ? "Enabled" : "Unavailable (no FCM)"}
        />
        <Line label="App version" value={Application.nativeApplicationVersion ?? "dev"} />
      </Card>

      <Card>
        <H2>Server</H2>
        <Field label="Server URL" value={url} onChangeText={(v) => { setUrl(v); setSaved(false); }} autoCapitalize="none" keyboardType="url" />
        <Button
          title={saved ? "Saved" : "Save"}
          variant="secondary"
          onPress={async () => {
            await setApiUrl(url || null);
            setSaved(true);
          }}
        />
      </Card>

      <Card>
        <H2>Reset this phone</H2>
        <Body muted>
          Deletes this phone's key. You will need your lecturer to enrol you again by tapping. Only do this if asked to.
        </Body>
        <Button
          title="Reset identity"
          variant="danger"
          onPress={() =>
            Alert.alert("Reset identity?", "Your lecturer will have to re-enrol this phone.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                style: "destructive",
                onPress: async () => {
                  await resetIdentity();
                  reload();
                },
              },
            ])
          }
        />
      </Card>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: "space-between" }}>
      <Body muted>{label}</Body>
      <Badge label={value} />
    </Row>
  );
}
