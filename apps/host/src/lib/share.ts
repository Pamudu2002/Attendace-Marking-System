import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { api } from "./api";

/** Downloads an authenticated CSV from the API and opens the Android share sheet. */
export async function shareCsv(path: string, filename: string, query?: Record<string, string | boolean>) {
  const res = await api.raw("GET", path, { query });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(await res.text());
  await Sharing.shareAsync(file.uri, { mimeType: "text/csv", dialogTitle: filename });
}
