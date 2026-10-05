package lk.attendance.reader

import android.nfc.TagLostException
import android.os.SystemClock
import java.io.IOException
import java.security.KeyFactory
import java.security.PublicKey
import java.security.SecureRandom
import java.security.Signature
import java.security.spec.X509EncodedKeySpec
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/** Abstraction over IsoDep so the protocol logic does not depend on a real tag. */
fun interface Transceiver {
  fun transceive(command: ByteArray): ByteArray
}

class ProtocolException(val detail: String) : Exception(detail)

data class StudentKey(
  val deviceId: String,
  val studentId: String,
  val fullName: String,
  val indexNumber: String,
  val publicKey: PublicKey,
)

class AttendanceSession(
  val sessionId: String,
  val label: String,
  val startsAt: Long,
  val endsAt: Long,
  val opensBeforeMin: Int,
  val lateAfterMin: Int,
  val roster: Map<String, StudentKey>,
  val marked: MutableSet<String>,
)

class EnrollSession(val classId: String, val label: String, val confirmTimeoutMs: Int)

/**
 * One tap = SELECT → AUTH → (verify) → CONFIRM, timed with elapsedRealtimeNanos for the experiment.
 * Spec: docs/IDENTITY_AND_AUTH.md §3.
 */
object ReaderEngine {
  private val random = SecureRandom()

  /** Monotonic clock for tap timings; replaceable in JVM unit tests (native-tests/). */
  @Volatile var nanoTime: () -> Long = { SystemClock.elapsedRealtimeNanos() }
  private val timeFmt = SimpleDateFormat("HH:mm", Locale.US)

  fun parseKey(spkiB64url: String): PublicKey =
    KeyFactory.getInstance("EC").generatePublic(X509EncodedKeySpec(Apdu.fromB64url(spkiB64url)))

  private fun ms(fromNs: Long, toNs: Long) = (toNs - fromNs) / 1_000_000.0

  data class Proof(
    val deviceId: String,
    val deviceIdBytes: ByteArray,
    val nonce: ByteArray,
    val hostTime: Long,
    val authData: ByteArray,
    val signature: ByteArray,
  )

  /** SELECT + AUTH. Fills tSelectMs/tAuthMs into [out]. */
  private fun readProof(t: Transceiver, purpose: Int, contextId: String, t0: Long, out: MutableMap<String, Any?>): Proof {
    val sel = t.transceive(Apdu.select())
    val t1 = nanoTime()
    out["tSelectMs"] = ms(t0, t1)
    when (val sw = Apdu.sw(sel)) {
      Apdu.SW_OK -> Unit
      Apdu.SW_FILE_NOT_FOUND -> throw ProtocolException("STUDENT_APP_NOT_INSTALLED")
      Apdu.SW_NOT_REGISTERED -> throw ProtocolException("STUDENT_APP_NOT_REGISTERED")
      else -> throw ProtocolException("SELECT_SW_%04X".format(sw))
    }
    val selData = Apdu.data(sel)
    if (selData.size < 17) throw ProtocolException("SELECT_SHORT_RESPONSE")
    val deviceIdBytes = selData.copyOfRange(1, 17)
    val deviceId = Apdu.bytesToUuid(deviceIdBytes)
    out["deviceId"] = deviceId

    val nonce = ByteArray(16).also { random.nextBytes(it) }
    val hostTime = System.currentTimeMillis()
    val authData = Apdu.authData(contextId, nonce, hostTime)
    val resp = t.transceive(Apdu.auth(purpose, authData))
    val t2 = nanoTime()
    out["tAuthMs"] = ms(t1, t2)
    val sw = Apdu.sw(resp)
    if (sw != Apdu.SW_OK) throw ProtocolException("AUTH_SW_%04X".format(sw))
    val data = Apdu.data(resp)
    if (data.size < 18) throw ProtocolException("AUTH_SHORT_RESPONSE")
    if (!data.copyOfRange(0, 16).contentEquals(deviceIdBytes)) throw ProtocolException("AUTH_DEVICE_MISMATCH")
    val sigLen = data[16].toInt() and 0xFF
    if (data.size < 17 + sigLen) throw ProtocolException("AUTH_BAD_SIGNATURE_LENGTH")
    val signature = data.copyOfRange(17, 17 + sigLen)

    out["nonce"] = Apdu.b64url(nonce)
    out["hostTime"] = hostTime.toDouble()
    out["signature"] = Apdu.b64url(signature)
    return Proof(deviceId, deviceIdBytes, nonce, hostTime, authData, signature)
  }

  private fun failure(e: Exception, out: MutableMap<String, Any?>, t0: Long) {
    when (e) {
      is TagLostException -> { out["outcome"] = "TAG_LOST"; out["errorDetail"] = "Phone moved away too early" }
      is ProtocolException -> { out["outcome"] = "PROTOCOL_ERROR"; out["errorDetail"] = e.detail }
      is IOException -> { out["outcome"] = "TIMEOUT"; out["errorDetail"] = e.message ?: "I/O error" }
      else -> { out["outcome"] = "PROTOCOL_ERROR"; out["errorDetail"] = e.javaClass.simpleName + ": " + e.message }
    }
    out["tTotalMs"] = ms(t0, nanoTime())
  }

  private fun baseEvent(purpose: String, contextId: String): MutableMap<String, Any?> = mutableMapOf(
    "tapId" to UUID.randomUUID().toString(),
    "purpose" to purpose,
    "contextId" to contextId,
    "discoveredAt" to System.currentTimeMillis().toDouble(),
  )

  /** Full attendance tap with on-device verification against the cached roster keys (works offline). */
  fun attend(t: Transceiver, s: AttendanceSession, t0: Long): Map<String, Any?> {
    val out = baseEvent("ATTEND", s.sessionId)
    try {
      val proof = readProof(t, Apdu.PURPOSE_ATTEND, s.sessionId, t0, out)
      val student = s.roster[proof.deviceId]
      var code: Int
      if (student == null) {
        code = Apdu.Result.UNKNOWN_DEVICE
        out["outcome"] = "UNKNOWN_DEVICE"
      } else {
        out["studentId"] = student.studentId
        out["fullName"] = student.fullName
        out["indexNumber"] = student.indexNumber
        val tv0 = nanoTime()
        val valid = Signature.getInstance("SHA256withECDSA").run {
          initVerify(student.publicKey)
          update(Apdu.proofMessage(Apdu.PURPOSE_ATTEND, proof.authData, proof.deviceIdBytes))
          try { verify(proof.signature) } catch (_: Exception) { false }
        }
        out["tVerifyMs"] = ms(tv0, nanoTime())
        val now = proof.hostTime
        val opens = s.startsAt - s.opensBeforeMin * 60_000L
        when {
          !valid -> { code = Apdu.Result.BAD_SIGNATURE; out["outcome"] = "BAD_SIGNATURE" }
          now < opens || now > s.endsAt -> { code = Apdu.Result.OUTSIDE_WINDOW; out["outcome"] = "OUTSIDE_WINDOW" }
          synchronized(s.marked) { s.marked.contains(student.studentId) } -> {
            code = Apdu.Result.ALREADY_MARKED; out["outcome"] = "DUPLICATE"
          }
          else -> {
            val late = now > s.startsAt + s.lateAfterMin * 60_000L
            code = if (late) Apdu.Result.LATE else Apdu.Result.PRESENT
            out["outcome"] = "OK"
            out["status"] = if (late) "LATE" else "PRESENT"
            synchronized(s.marked) { s.marked.add(student.studentId) }
          }
        }
      }
      val tVerdict = nanoTime()
      out["tTotalMs"] = ms(t0, tVerdict)
      out["resultCode"] = code
      sendConfirm(t, code, confirmText(code, s.label, proof.hostTime), out, tVerdict)
    } catch (e: Exception) {
      failure(e, out, t0)
    }
    return out
  }

  /** SELECT + AUTH for enrolment. The server verifies the proof (the host has no key for an unenrolled phone). */
  fun enrollProof(t: Transceiver, s: EnrollSession, t0: Long): MutableMap<String, Any?> {
    val out = baseEvent("ENROLL", s.classId)
    try {
      readProof(t, Apdu.PURPOSE_ENROLL, s.classId, t0, out)
      out["outcome"] = "PENDING"
      out["tTotalMs"] = ms(t0, nanoTime())
    } catch (e: Exception) {
      failure(e, out, t0)
    }
    return out
  }

  fun sendConfirm(t: Transceiver, code: Int, text: String, out: MutableMap<String, Any?>, from: Long) {
    try {
      t.transceive(Apdu.confirm(code, text))
      out["tConfirmMs"] = ms(from, nanoTime())
      out["confirmed"] = true
    } catch (e: Exception) {
      // The verdict stands; the student just doesn't get the on-phone notification.
      out["confirmed"] = false
    }
  }

  fun confirmText(code: Int, label: String, at: Long): String {
    val time = synchronized(timeFmt) { timeFmt.format(Date(at)) }
    return when (code) {
      Apdu.Result.PRESENT -> "Present: $label $time"
      Apdu.Result.LATE -> "Late: $label $time"
      Apdu.Result.ALREADY_MARKED -> "Already marked: $label"
      Apdu.Result.ENROLLED -> "Enrolled: $label"
      Apdu.Result.NOT_ENROLLED -> "Not enrolled in $label"
      Apdu.Result.OUTSIDE_WINDOW -> "Check-in closed: $label"
      Apdu.Result.BAD_SIGNATURE -> "Verification failed"
      else -> "Unknown phone. Ask lecturer."
    }
  }
}
