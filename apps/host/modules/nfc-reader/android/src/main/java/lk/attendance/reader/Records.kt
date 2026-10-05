package lk.attendance.reader

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class RosterEntryRecord : Record {
  @Field val deviceId: String = ""
  @Field val studentId: String = ""
  @Field val fullName: String = ""
  @Field val indexNumber: String = ""
  /** SubjectPublicKeyInfo DER, base64url. */
  @Field val publicKey: String = ""
}

class AttendanceConfigRecord : Record {
  @Field val sessionId: String = ""
  /** Shown on the student's phone, e.g. "CS4473 Lecture 5". */
  @Field val label: String = ""
  @Field val startsAt: Double = 0.0
  @Field val endsAt: Double = 0.0
  @Field val checkInOpensBeforeMin: Int = 15
  @Field val lateAfterMin: Int = 15
  @Field val roster: List<RosterEntryRecord> = emptyList()
  /** Students already recorded for this session (from the local queue / server). */
  @Field val alreadyMarked: List<String> = emptyList()
}

class EnrollConfigRecord : Record {
  @Field val classId: String = ""
  @Field val label: String = ""
  /** How long to keep the tag connected while JS asks the server, before giving up on CONFIRM. */
  @Field val confirmTimeoutMs: Int = 8000
}
