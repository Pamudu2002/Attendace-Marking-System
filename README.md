# NFC Attendance Marking System

CS4473 Mobile Computing group research project. Students' Android phones act as contactless NFC cards
(Host Card Emulation), and the lecturer's phone reads them to record class attendance.

| Part | Path | What it is |
|---|---|---|
| Host app | `apps/host` | Lecturer app (Expo / React Native) + Kotlin NFC **reader** module: classes, enrol-by-tap, session calendar, live offline check-in, analytics, experiment mode |
| Student app | `apps/student` | Student app (Expo / React Native) + Kotlin **HCE card** module: classes, 30-minute reminders, attendance history; tapping works with the app closed |
| Backend | `apps/backend` | Next.js API (`/api/v1`) + PostgreSQL (Prisma) + pg-boss worker for push reminders |
| Shared | `packages/shared` | APDU protocol constants, proof-message builder, zod request schemas, API types, attendance maths |
| Mobile core | `packages/mobile-core` | Theme, UI components and the token-refreshing API client used by both apps |
| Native tests | `native-tests` | JVM build of the Kotlin NFC code + protocol tests (no Android SDK needed) |
| Analysis | `analysis` | Script that turns the exported tap telemetry into the report's tables and figures |

Design docs: [Phase 1 plan](docs/PLAN.md) · [Identity, NFC protocol & auth](docs/IDENTITY_AND_AUTH.md) · [API reference](docs/API.md)

---

## Quick start

### Prerequisites

- Node.js 22, pnpm 10 (`corepack enable`)
- PostgreSQL 16 (or Docker)
- For the phones: Android Studio (SDK + platform tools) and **two NFC-capable Android phones** (HCE support needed on the student phone). Expo Go cannot use NFC, so the apps run as development builds.

```bash
pnpm install
```

### Backend

```bash
docker compose up -d postgres            # or use your own Postgres 16
cp apps/backend/.env.example apps/backend/.env   # set JWT_SECRET (32+ chars)
pnpm --filter @attendance/backend db:deploy      # apply migrations
pnpm --filter @attendance/backend db:seed        # optional demo data: demo@uni.lk / demo-password
pnpm --filter @attendance/backend dev            # API on http://0.0.0.0:3000
pnpm --filter @attendance/backend worker         # second terminal: reminders + push jobs
```

Health check: `curl http://localhost:3000/api/v1/health`

**Push reminders** need Firebase Cloud Messaging:

1. Create a Firebase project and add an Android app with package `lk.attendance.student`.
2. Put its `google-services.json` in `apps/student/`. It is git-ignored and picked up by `app.config.ts`.
3. Paste a service-account key (one line of JSON) into `FIREBASE_SERVICE_ACCOUNT_JSON` in `apps/backend/.env`.

Without it the worker logs reminders instead of sending them (`[push:dry-run]`).

### Mobile apps

The phones must reach the backend. Use your laptop's LAN IP (same Wi-Fi), e.g. `http://192.168.1.20:3000`, or a tunnel (`cloudflared tunnel --url http://localhost:3000`). You can set it at build time with `EXPO_PUBLIC_API_URL` or later in each app (login screen / Settings).

```bash
# Student phone (USB debugging on)
cd apps/student && EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo run:android
# Lecturer phone
cd apps/host && EXPO_PUBLIC_API_URL=http://192.168.1.20:3000 npx expo run:android
```

`expo run:android` runs `expo prebuild`, which generates `android/` (git-ignored) and autolinks the local Kotlin modules in `modules/`. It then builds and installs a development build. Use `npx expo start --dev-client` for later JS-only changes. You can also build in the cloud with `npx eas-cli build --profile development -p android`.

### Demo flow

1. **Student app**: open it once with internet. It creates a Keystore key and registers the phone ("Not enrolled yet").
2. **Host app**: register/sign in → *New class* → class → *Students* → *Add student by tap*. Type the name and index number, press *Ready*, then hold the two phones back to back. The student phone shows "Enrolled ✓".
3. **Host**: *Sessions* → pick a day → *Add session* (name, start, end, optional weekly repeat). Enrolled students get a push reminder 30 minutes before.
4. **Host**: open the session → *Start NFC check-in*. **Student**: unlock the phone and tap. The app doesn't need to be open. The host shows the student's name; the student phone shows "Checked in ✓". This works offline: taps are verified on the lecturer's phone and synced later.
5. **Host**: class → *Insights*: per-student % against the 80% line, trend, student × session matrix, arrival times, weekday pattern, CSV export.
6. **Experiment**: host *Experiment* tab → set run ID and conditions → run check-ins → *Export tap CSV* → `analysis/analyze_taps.py`.

---

## Tests and checks

```bash
pnpm --filter @attendance/shared test            # protocol layout + attendance maths
pnpm --filter @attendance/backend test           # API integration tests (needs Postgres; uses DB attendance_test)
pnpm --filter @attendance/backend typecheck
(cd apps/student && npx tsc --noEmit) && (cd apps/host && npx tsc --noEmit)
(cd native-tests && ./gradlew test)              # Kotlin NFC code on the JVM (Gradle 8.14 + JDK 17+)
```

- **Backend tests** cover auth (refresh rotation and reuse detection, device challenge–response), the enrolment binding rules, forged/stale/replayed proofs, offline batch re-verification, the 80% projections and analytics, reminder logging and telemetry.
- **`native-tests`** compiles the student HCE service, Keystore identity and the reader engine against Robolectric's `android-all` framework jar. It then runs the reader against a simulated student card and checks that Kotlin and TypeScript build **byte-identical** proof messages, using a signature produced by Node.

### What has not been verified yet

These checks ran without phones or an Android SDK, so the following still needs a real device:

- A full Gradle/APK build, including the two thin Expo bridge classes (`AttendanceHceModule.kt`, `NfcReaderModule.kt`).
- Phone-to-phone NFC behaviour (antenna placement, timing, locked-screen behaviour).
- FCM delivery.

Do the two-phone NFC spike (plan milestone M1) first when you build the apps.

---

## Repository layout

```
apps/
  backend/   Next.js route handlers (src/app/api/v1), Prisma schema + migrations, worker, tests
  host/      Expo app (src/app = routes), modules/nfc-reader (Kotlin)
  student/   Expo app (src/app = routes), modules/attendance-hce (Kotlin HostApduService)
packages/
  shared/        protocol + schemas + types (used by all three)
  mobile-core/   UI kit + API client (used by both apps)
native-tests/    JVM build + JUnit tests for the Kotlin NFC code
analysis/        analyze_taps.py for the experiment data package
docs/            plan, identity/auth/protocol, API reference
```
