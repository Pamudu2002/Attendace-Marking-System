import { ownedClass } from "@/lib/access";
import { matrix } from "@/lib/analytics";
import { requireTeacher } from "@/lib/auth";
import { sha256Hex } from "@/lib/crypto";
import { csvResponse, toCsv } from "@/lib/csv";
import { env } from "@/lib/env";
import { handler } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Student × session matrix. ?pseudonymise=true replaces names/index numbers with salted hashes. */
export const GET = handler<{ classId: string }>(async (req, { classId }) => {
  const { teacherId } = await requireTeacher(req);
  const cls = await ownedClass(teacherId, classId);
  const pseudo = req.nextUrl.searchParams.get("pseudonymise") === "true";
  const m = await matrix(cls.id);
  const header = ["student", ...(pseudo ? [] : ["full_name"]), ...m.sessions.map((s) => `${s.name} (${s.startsAt})`), "attended", "counted", "pct"];
  const rows = m.students.map((st, i) => {
    const cells = m.cells[i] ?? [];
    const counted = cells.filter((c) => c !== null).length;
    const attended = cells.filter((c) => c && c !== "ABSENT").length;
    return [
      pseudo ? sha256Hex(`${st.indexNumber}:${env.exportHashSalt}`).slice(0, 12) : st.indexNumber,
      ...(pseudo ? [] : [st.fullName]),
      ...cells.map((c) => c ?? ""),
      attended,
      counted,
      counted ? Math.round((1000 * attended) / counted) / 10 : "",
    ];
  });
  const name = (cls.code || cls.name).replace(/[^a-z0-9]+/gi, "_");
  return csvResponse(`${name}_attendance.csv`, toCsv(header, rows));
});
