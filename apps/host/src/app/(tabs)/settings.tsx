import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { Badge, Body, Button, Card, Field, H2, Row, Screen } from "@attendance/mobile-core";
import { NfcReader } from "../../../modules/nfc-reader";
import { useAuth } from "@/lib/auth";
import { getApiUrl, setApiUrl } from "@/lib/config";
import { pendingCounts } from "@/lib/db";
import { syncAll } from "@/lib/sync";

export default function SettingsScreen() {
  const { teacher, logout } = useAuth();
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState({ attendance: 0, taps: 0 });
  const [syncing, setSyncing] = useState(false);
  const nfc = NfcReader.getStatus();

  useEffect(() => {
    getApiUrl().then(setUrl);
  }, []);
  const refresh = useCallback(() => {
    pendingCounts().then(setPending);
  }, []);
  useFocusEffect(refresh);

  return (
    <Screen>
      <Card>
        <H2>{teacher?.fullName}</H2>
        <Body muted>{teacher?.email}</Body>
        <Row style={{ justifyContent: "space-between" }}>
          <Body muted>NFC reader</Body>
          <Badge label={!nfc.nfcSupported ? "Not supported" : nfc.nfcEnabled ? "On" : "Off"} tone={nfc.nfcEnabled ? "good" : "bad"} />
        </Row>
        {nfc.nfcSupported && !nfc.nfcEnabled ? <Button title="Open NFC settings" variant="secondary" onPress={() => NfcReader.openNfcSettings()} /> : null}
      </Card>

      <Card>
        <H2>Offline queue</H2>
        <Body>
          {pending.attendance} check-ins and {pending.taps} tap logs waiting to upload.
        </Body>
        <Button
          title="Sync now"
          variant="secondary"
          loading={syncing}
          onPress={async () => {
            setSyncing(true);
            await syncAll();
            refresh();
            setSyncing(false);
          }}
        />
      </Card>

      <Card>
        <H2>Server</H2>
        <Field label="Server URL" value={url} onChangeText={(v) => { setUrl(v); setSaved(false); }} autoCapitalize="none" keyboardType="url" />
        <Button
          title={saved ? "Saved" : "Save"}
          variant="secondary"
          disabled={saved}
          onPress={async () => {
            await setApiUrl(url || null);
            setSaved(true);
          }}
        />
      </Card>

      <Button title="Sign out" variant="danger" onPress={logout} />
    </Screen>
  );
}
