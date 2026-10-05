/**
 * Demo data so the analytics screens have something to show before real phones are used:
 *   teacher demo@uni.lk / demo-password, class CS4473 with 12 students and 10 weeks of sessions.
 * Run: pnpm --filter @attendance/backend db:seed   (only affects the demo teacher's data)
 */
import "dotenv/config";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { hashPassword } from "../src/lib/auth";
import { prisma } from "../src/lib/db";

const DAY = 86_400_000;
const EMAIL = "demo@uni.lk";

async function main() {
  const existing = await prisma.teacher.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log("Demo teacher already exists; delete it first to reseed.");
    return;
  }
  const teacher = await prisma.teacher.create({
    data: { email: EMAIL, fullName: "Demo Lecturer", passwordHash: await hashPassword("demo-password") },
  });
  const cls = await prisma.class.create({ data: { teacherId: teacher.id, name: "Mobile Computing", code: "CS4473" } });

  // Students with different habits: probability of attending and of being late.
  const habits = [0.98, 0.95, 0.92, 0.9, 0.88, 0.85, 0.8, 0.75, 0.7, 0.6, 0.5, 0.35];
  const students = [];
  for (const [i, p] of habits.entries()) {
    const index = `DEMO${String(i + 1).padStart(3, "0")}X`;
    const student = await prisma.student.upsert({
      where: { indexNumber: index },
      update: {},
      create: { indexNumber: index, fullName: `Demo Student ${i + 1}` },
    });
    const { publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const device = await prisma.studentDevice.create({
      data: {
        studentId: student.id,
        publicKey: publicKey.export({ format: "der", type: "spki" }),
        model: "Seeded",
        boundAt: new Date(),
      },
    });
    await prisma.enrollment.create({
      data: { classId: cls.id, studentId: student.id, enrolledDeviceId: device.id, enrolledAt: new Date(Date.now() - 80 * DAY) },
    });
    students.push({ student, device, p });
  }

  // 10 weekly lectures in the past, 4 in the future (two per week: Mon 08:30 and Thu 13:30 UTC+5:30 -> 03:00/08:00 UTC).
  const base = new Date();
  base.setUTCHours(3, 0, 0, 0);
  for (let w = -10; w < 4; w++) {
    for (const [offset, hour, label] of [
      [0, 3, "Lecture"],
      [3, 8, "Lab"],
    ] as const) {
      const startsAt = new Date(base.getTime() + w * 7 * DAY + offset * DAY);
      startsAt.setUTCHours(hour, 0, 0, 0);
      const session = await prisma.classSession.create({
        data: {
          classId: cls.id,
          name: `${label} W${w + 11}`,
          startsAt,
          endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
        },
      });
      if (session.endsAt > new Date()) continue;
      const labPenalty = label === "Lab" ? 0.05 : 0;
      for (const { student, device, p } of students) {
        if (Math.random() > p - labPenalty) continue;
        const minutes = Math.random() < 0.15 ? 15 + Math.random() * 25 : -10 + Math.random() * 20;
        await prisma.attendanceRecord.create({
          data: {
            clientRecordId: randomUUID(),
            sessionId: session.id,
            studentId: student.id,
            deviceId: device.id,
            status: minutes > 15 ? "LATE" : "PRESENT",
            source: "NFC",
            tappedAt: new Date(startsAt.getTime() + minutes * 60_000),
            markedById: teacher.id,
          },
        });
      }
    }
  }
  console.log(`Seeded ${EMAIL} / demo-password with class ${cls.id}`);
}

main().finally(() => prisma.$disconnect());
