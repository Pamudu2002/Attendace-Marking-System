# API Reference (Phase 1)

> Related: [Plan](./PLAN.md) · [Identity, NFC protocol & auth](./IDENTITY_AND_AUTH.md)

## Conventions

- Base URL: `/api/v1`. Next.js App Router route handlers with `export const runtime = "nodejs"`.
- JSON in and out. Timestamps are ISO-8601 UTC strings. IDs are UUIDs. Binary values (keys, nonces, signatures) are **base64url**.
- Auth: `Authorization: Bearer <accessToken>`. **Role** column: `public`, `teacher`, `student` (= `student_device`).
- Validation: zod schemas in `packages/shared`, used by both server and apps.
- Lists: `?limit=50&cursor=<opaque>` → `{ items: [...], nextCursor }`.
- Idempotency: sync endpoints take client-generated UUIDs (`clientRecordId`, `clientEventId`), so retries are safe.
- Errors:

```json
{ "error": { "code": "STUDENT_HAS_OTHER_DEVICE", "message": "…", "details": { } } }
```

| HTTP | Typical codes |
|---|---|
| 400 | `VALIDATION_ERROR` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `DEVICE_REVOKED` |
| 403 | `FORBIDDEN` (not your class) |
| 404 | `NOT_FOUND` |
| 409 | `DEVICE_BOUND_TO_OTHER_STUDENT`, `STUDENT_HAS_OTHER_DEVICE`, `ALREADY_ENROLLED`, `SESSION_OVERLAP` (warning only) |
| 422 | `BAD_SIGNATURE`, `STALE_PROOF`, `OUTSIDE_WINDOW`, `INVALID_TIME_RANGE` |
| 429 | `RATE_LIMITED` |

---

## 1. Health

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/health` | public | `{ status: "ok", db: "ok", time }`. Also used for host clock-skew checks |

## 2. Auth: teacher

| Method | Path | Role | Body → Response |
|---|---|---|---|
| POST | `/auth/teacher/register` | public | `{ email, password, fullName }` → `201 { teacher, accessToken, refreshToken }` |
| POST | `/auth/teacher/login` | public | `{ email, password }` → `{ teacher, accessToken, refreshToken }` |
| GET | `/auth/teacher/me` | teacher | → `{ id, email, fullName }` |
| PATCH | `/auth/teacher/me` | teacher | `{ fullName?, currentPassword?, newPassword? }` |

## 3. Auth: student device

| Method | Path | Role | Body → Response |
|---|---|---|---|
| POST | `/auth/student/devices` | public (rate-limited) | `{ publicKey, keyAlgorithm: "ES256", hardwareBacked, manufacturer, model, androidVersion, appVersion, attestationChain? }` → `201 { deviceId }` |
| POST | `/auth/student/challenge` | public | `{ deviceId }` → `{ challengeId, nonce, expiresAt }` (nonce is 32 B, valid for 2 min) |
| POST | `/auth/student/verify` | public | `{ challengeId, signature }` → `{ accessToken, refreshToken, bound, student? }` |

## 4. Auth: shared

| Method | Path | Role | Body → Response |
|---|---|---|---|
| POST | `/auth/refresh` | public | `{ refreshToken }` → `{ accessToken, refreshToken }` (rotates; reuse revokes the token family) |
| POST | `/auth/logout` | teacher/student | `{ refreshToken }` → `204` |

---

## 5. Classes (teacher)

| Method | Path | Body / Query → Response |
|---|---|---|
| GET | `/classes` | `?archived=false` → `{ items: [{ id, name, code, studentCount, nextSession, avgAttendancePct }] }` |
| POST | `/classes` | `{ name, code?, thresholdPct?=80, lateAfterMin?=15, checkInOpensBeforeMin?=15 }` → `201 Class` |
| GET | `/classes/{classId}` | → `Class` + counts |
| PATCH | `/classes/{classId}` | any of the create fields, or `{ archived: true }` |
| DELETE | `/classes/{classId}` | → `204` (only if no attendance yet; otherwise archive) |

## 6. Roster and enrolment (teacher)

| Method | Path | Body / Query → Response |
|---|---|---|
| GET | `/classes/{classId}/students` | → `{ items: [{ studentId, indexNumber, fullName, enrolledAt, device: { id, model, status }, attendancePct }] }` |
| POST | `/classes/{classId}/enrollments` | **Enrol by tap**, see below |
| DELETE | `/classes/{classId}/enrollments/{studentId}` | → `204` (soft-remove: sets `removedAt`) |
| GET | `/classes/{classId}/roster-keys` | For **offline check-in**. → `{ version, items: [{ studentId, indexNumber, fullName, deviceId, publicKey }] }`. Supports `If-None-Match` / ETag |

**`POST /classes/{classId}/enrollments`**

```json
{
  "fullName": "Nimal Perera",
  "indexNumber": "200123X",
  "proof": {
    "deviceId": "6f1c…",
    "nonce": "base64url(16B)",
    "hostTime": 1759650000000,
    "signature": "base64url(DER)"
  },
  "replaceDevice": false
}
```

The server verifies the signature over the ENROLL message with `contextId = classId`, requires `|now − hostTime| ≤ 5 min`, then applies the binding rules in IDENTITY_AND_AUTH §1.3.

→ `201 { student: { id, indexNumber, fullName }, enrollment: { enrolledAt }, warnings: [] }`
After success, the server sends an FCM data message `{ type: "ENROLLED", classId }` to the device.

## 7. Sessions (teacher)

| Method | Path | Body / Query → Response |
|---|---|---|
| GET | `/classes/{classId}/sessions` | `?from=…&to=…` (calendar range) → `{ items: [{ id, name, startsAt, endsAt, cancelledAt, presentCount, enrolledCount }] }` |
| POST | `/classes/{classId}/sessions` | `{ name, startsAt, endsAt }` → `201 Session` (schedules the 30-min reminder; `422 INVALID_TIME_RANGE` if `endsAt ≤ startsAt`) |
| POST | `/classes/{classId}/sessions/bulk` | `{ name, startsAt, endsAt, repeat: { weekly: true, until } }` → `201 { items }` (optional: recurring weekly lectures) |
| GET | `/sessions/{sessionId}` | → `Session` + class info |
| PATCH | `/sessions/{sessionId}` | `{ name?, startsAt?, endsAt? }` (reschedules reminder; pushes `SESSION_CHANGED`) |
| POST | `/sessions/{sessionId}/cancel` | → `Session` (cancels reminder; pushes `SESSION_CANCELLED`) |
| DELETE | `/sessions/{sessionId}` | → `204` (only if no attendance) |

## 8. Attendance (teacher)

| Method | Path | Body / Query → Response |
|---|---|---|
| GET | `/sessions/{sessionId}/attendance` | → `{ session, items: [{ studentId, indexNumber, fullName, status: "PRESENT"\|"LATE"\|"EXCUSED"\|"ABSENT", tappedAt, source }] }` (ABSENT is derived) |
| POST | `/sessions/{sessionId}/attendance/batch` | Offline-sync upload, see below |
| PUT | `/sessions/{sessionId}/attendance/{studentId}` | Manual override: `{ status: "PRESENT"\|"LATE"\|"EXCUSED", note }` → record with `source = MANUAL` |
| DELETE | `/sessions/{sessionId}/attendance/{studentId}` | Remove a wrong record → `204` |

**`POST /sessions/{sessionId}/attendance/batch`**

```json
{
  "records": [
    {
      "clientRecordId": "uuid",
      "deviceId": "uuid",
      "status": "PRESENT",
      "tappedAt": "2026-10-06T04:32:10.120Z",
      "proof": { "nonce": "…", "hostTime": 1759725130120, "signature": "…" }
    }
  ]
}
```

→ `200 { results: [{ clientRecordId, result: "accepted" | "duplicate" | "rejected", reason? }] }`
The server re-verifies each signature (ATTEND message, `contextId = sessionId`), checks that the device is bound to an enrolled student and that `hostTime` is within the session window, and recomputes LATE from `hostTime`.

## 9. Analytics and export (teacher)

| Method | Path | Response |
|---|---|---|
| GET | `/classes/{classId}/analytics/summary` | `{ thresholdPct, sessionsHeld, sessionsRemaining, classAvgPct, onTimePct, belowThresholdCount, statusSplit: { present, late, excused, absent } }` |
| GET | `/classes/{classId}/analytics/students` | `{ items: [{ studentId, indexNumber, fullName, counted, attended, late, pct, belowThreshold, maxAchievablePct, sessionsNeededFor80 }] }` sorted by `pct` asc |
| GET | `/classes/{classId}/analytics/students/{studentId}` | `{ student, pct, timeline: [{ sessionId, name, startsAt, status, minutesFromStart }], longestStreak, currentStreak }` |
| GET | `/classes/{classId}/analytics/sessions` | `{ items: [{ sessionId, name, startsAt, presentPct, latePct, count }] }` (trend line) |
| GET | `/classes/{classId}/analytics/matrix` | `{ students: [...], sessions: [...], cells: [[status,…],…] }` (heat-map) |
| GET | `/classes/{classId}/analytics/arrivals` | `{ bins: [{ minuteFrom, minuteTo, count }] }` (punctuality histogram) |
| GET | `/classes/{classId}/analytics/patterns` | `{ byWeekday: [...], byStartHour: [...] }` |
| GET | `/classes/{classId}/export/attendance.csv` | CSV matrix. `?pseudonymise=true` replaces names with hashed IDs |

## 10. Experiment telemetry (teacher / host app)

| Method | Path | Body / Query → Response |
|---|---|---|
| POST | `/telemetry/taps` | `{ events: [{ clientEventId, hostModel, purpose, contextId, deviceIdHash, outcome, discoveredAt, tSelectMs, tAuthMs, tVerifyMs, tTotalMs, conditions, errorDetail }] }` → `{ accepted, duplicates }` |
| GET | `/telemetry/taps` | `?runId=&from=&to=` → paged events |
| GET | `/telemetry/taps.csv` | Raw CSV for the data package |
| GET | `/telemetry/notifications.csv` | `scheduledFor, sentAt, receivedAt, delayMs, deviceModel` (reminder delay experiment) |

## 11. Student app

| Method | Path | Body / Query → Response |
|---|---|---|
| GET | `/student/me` | `{ deviceId, bound, student?: { indexNumber, fullName } }` |
| PUT | `/student/device` | `{ fcmToken?, appVersion?, androidVersion? }` → `204` (called on launch and on FCM token refresh) |
| GET | `/student/classes` | `{ items: [{ classId, name, code, teacherName, attendancePct, thresholdPct, nextSession }] }` |
| GET | `/student/classes/{classId}` | `{ class, attendancePct, maxAchievablePct, sessionsNeededFor80, history: [{ sessionId, name, startsAt, status }] }` |
| GET | `/student/sessions` | `?from=&to=` (default now → +30 days) → `{ items: [Session + { className, myStatus }] }` across all enrolled classes |
| POST | `/student/notifications/{notificationId}/ack` | `{ receivedAt, openedAt? }` → `204` (delivery-delay measurement) |

## 12. FCM messages sent by the backend

All messages are **data-only** with Android `priority: "high"`, in the format expo-notifications understands. Visible messages carry `title`, `message` and `channelId: "reminders"`. Expo renders those natively even when the app is killed and also runs the app's background task. Every message carries the payload as a JSON string in `body` (`{ type, sessionId?, classId?, notificationId? }`). Silent messages have no `title`/`message`.

| `body.type` | When | Student app action |
|---|---|---|
| `SESSION_REMINDER` | `startsAt − 30 min` | Show notification "CS4473 Lecture 5 starts at 10:00. Tap the lecturer's phone to check in". Ack |
| `SESSION_CHANGED` | Session time or name edited | Show notification + refetch sessions |
| `SESSION_CANCELLED` | Session cancelled | Show notification + refetch |
| `ENROLLED` | Enrolment created | Refetch classes (silent) |
| `DEVICE_REVOKED` | Device replaced | Clear tokens, show "This phone is no longer linked" |

## 13. Route file map (Next.js)

```
src/app/api/v1/
  health/route.ts
  auth/teacher/{register,login,me}/route.ts
  auth/student/{devices,challenge,verify}/route.ts
  auth/{refresh,logout}/route.ts
  classes/route.ts
  classes/[classId]/route.ts
  classes/[classId]/students/route.ts
  classes/[classId]/enrollments/route.ts
  classes/[classId]/enrollments/[studentId]/route.ts
  classes/[classId]/roster-keys/route.ts
  classes/[classId]/sessions/route.ts
  classes/[classId]/sessions/bulk/route.ts
  classes/[classId]/analytics/{summary,students,sessions,matrix,arrivals,patterns}/route.ts
  classes/[classId]/analytics/students/[studentId]/route.ts
  classes/[classId]/export/attendance.csv/route.ts
  sessions/[sessionId]/route.ts
  sessions/[sessionId]/cancel/route.ts
  sessions/[sessionId]/attendance/route.ts
  sessions/[sessionId]/attendance/batch/route.ts
  sessions/[sessionId]/attendance/[studentId]/route.ts
  telemetry/taps/route.ts
  telemetry/taps.csv/route.ts
  telemetry/notifications.csv/route.ts
  student/{me,device,classes,sessions}/route.ts
  student/classes/[classId]/route.ts
  student/notifications/[notificationId]/ack/route.ts
```
