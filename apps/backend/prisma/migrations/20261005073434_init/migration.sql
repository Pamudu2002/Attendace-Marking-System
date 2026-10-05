-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('NFC', 'MANUAL');

-- CreateEnum
CREATE TYPE "TapPurpose" AS ENUM ('ENROLL', 'ATTEND');

-- CreateEnum
CREATE TYPE "TapOutcome" AS ENUM ('OK', 'DUPLICATE', 'NOT_ENROLLED', 'UNKNOWN_DEVICE', 'BAD_SIGNATURE', 'OUTSIDE_WINDOW', 'TAG_LOST', 'TIMEOUT', 'PROTOCOL_ERROR');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('TEACHER', 'STUDENT_DEVICE');

-- CreateTable
CREATE TABLE "teacher" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "subject_type" "SubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student" (
    "id" UUID NOT NULL,
    "index_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_device" (
    "id" UUID NOT NULL,
    "student_id" UUID,
    "public_key" BYTEA NOT NULL,
    "key_algorithm" TEXT NOT NULL DEFAULT 'ES256',
    "hardware_backed" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "fcm_token" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "android_version" TEXT,
    "app_version" TEXT,
    "bound_at" TIMESTAMPTZ(3),
    "last_seen_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_challenge" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "nonce" BYTEA NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "threshold_pct" INTEGER NOT NULL DEFAULT 80,
    "late_after_min" INTEGER NOT NULL DEFAULT 15,
    "check_in_opens_before_min" INTEGER NOT NULL DEFAULT 15,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enrollment" (
    "class_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolled_device_id" UUID,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "enrollment_pkey" PRIMARY KEY ("class_id","student_id")
);

-- CreateTable
CREATE TABLE "class_session" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "reminder_job_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "class_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_record" (
    "id" UUID NOT NULL,
    "client_record_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "device_id" UUID,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'NFC',
    "tapped_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "host_time" BIGINT,
    "nonce" BYTEA,
    "signature" BYTEA,
    "marked_by_id" UUID NOT NULL,
    "note" TEXT,

    CONSTRAINT "attendance_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tap_event" (
    "id" UUID NOT NULL,
    "client_event_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "host_model" TEXT NOT NULL,
    "purpose" "TapPurpose" NOT NULL,
    "context_id" UUID,
    "device_id_hash" TEXT,
    "outcome" "TapOutcome" NOT NULL,
    "discovered_at" TIMESTAMPTZ(3) NOT NULL,
    "t_select_ms" DOUBLE PRECISION,
    "t_auth_ms" DOUBLE PRECISION,
    "t_verify_ms" DOUBLE PRECISION,
    "t_total_ms" DOUBLE PRECISION,
    "conditions" JSONB,
    "error_detail" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tap_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_log" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "fcm_message_id" TEXT,
    "error" TEXT,
    "received_at" TIMESTAMPTZ(3),
    "opened_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teacher_email_key" ON "teacher"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_subject_type_subject_id_idx" ON "refresh_token"("subject_type", "subject_id");

-- CreateIndex
CREATE INDEX "refresh_token_family_id_idx" ON "refresh_token"("family_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_index_number_key" ON "student"("index_number");

-- CreateIndex
CREATE INDEX "student_device_student_id_idx" ON "student_device"("student_id");

-- CreateIndex
CREATE INDEX "auth_challenge_device_id_idx" ON "auth_challenge"("device_id");

-- CreateIndex
CREATE INDEX "class_teacher_id_idx" ON "class"("teacher_id");

-- CreateIndex
CREATE INDEX "enrollment_student_id_idx" ON "enrollment"("student_id");

-- CreateIndex
CREATE INDEX "class_session_class_id_starts_at_idx" ON "class_session"("class_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_client_record_id_key" ON "attendance_record"("client_record_id");

-- CreateIndex
CREATE INDEX "attendance_record_student_id_idx" ON "attendance_record"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_record_session_id_student_id_key" ON "attendance_record"("session_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "tap_event_client_event_id_key" ON "tap_event"("client_event_id");

-- CreateIndex
CREATE INDEX "tap_event_teacher_id_discovered_at_idx" ON "tap_event"("teacher_id", "discovered_at");

-- CreateIndex
CREATE INDEX "notification_log_session_id_idx" ON "notification_log"("session_id");

-- CreateIndex
CREATE INDEX "notification_log_device_id_idx" ON "notification_log"("device_id");

-- AddForeignKey
ALTER TABLE "student_device" ADD CONSTRAINT "student_device_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_challenge" ADD CONSTRAINT "auth_challenge_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "student_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class" ADD CONSTRAINT "class_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_record" ADD CONSTRAINT "attendance_record_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tap_event" ADD CONSTRAINT "tap_event_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "class_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "student_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints Prisma cannot express (docs/IDENTITY_AND_AUTH.md §1.3, docs/PLAN.md §6)
CREATE UNIQUE INDEX "one_active_device_per_student"
  ON "student_device"("student_id") WHERE "status" = 'ACTIVE' AND "student_id" IS NOT NULL;

ALTER TABLE "class_session"
  ADD CONSTRAINT "class_session_time_range_check" CHECK ("ends_at" > "starts_at");
