package lk.attendance

import lk.attendance.hce.Protocol
import lk.attendance.reader.Apdu
import lk.attendance.reader.AttendanceSession
import lk.attendance.reader.EnrollSession
import lk.attendance.reader.ReaderEngine
import lk.attendance.reader.StudentKey
import lk.attendance.reader.Transceiver
import org.json.JSONObject
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec
import java.util.UUID
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
private fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

private fun ecKeyPair(): KeyPair =
  KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()

/**
 * Software stand-in for the student's AttendanceHceService: same APDU handling, built on the student
 * module's Protocol helpers, but with a JVM key instead of the Android Keystore.
 */
class FakeStudentCard(
  val deviceId: String = UUID.randomUUID().toString(),
  val keys: KeyPair = ecKeyPair(),
  private val registered: Boolean = true,
) : Transceiver {
  val confirms = mutableListOf<Pair<Int, String>>()

  override fun transceive(command: ByteArray): ByteArray {
    if (Protocol.isSelectAid(command)) {
      if (!registered) return Protocol.sw(Protocol.SW_NOT_REGISTERED)
      return byteArrayOf(Protocol.PROTOCOL_VERSION) + Protocol.uuidToBytes(deviceId) + Protocol.sw(Protocol.SW_OK)
    }
    val ins = command[1].toInt() and 0xFF
    return when (ins) {
      Protocol.INS_AUTH -> {
        val purpose = command[2].toInt() and 0xFF
        val lc = command[4].toInt() and 0xFF
        assertEquals(Protocol.AUTH_DATA_LENGTH, lc)
        val id = Protocol.uuidToBytes(deviceId)
        val msg = Protocol.nfcProofMessage(purpose, command.copyOfRange(5, 5 + lc), id)
        val sig = Signature.getInstance("SHA256withECDSA").run { initSign(keys.private); update(msg); sign() }
        id + byteArrayOf(sig.size.toByte()) + sig + Protocol.sw(Protocol.SW_OK)
      }
      Protocol.INS_CONFIRM -> {
        val lc = command[4].toInt() and 0xFF
        confirms += (command[2].toInt() and 0xFF) to String(command.copyOfRange(5, 5 + lc), Charsets.UTF_8)
        Protocol.sw(Protocol.SW_OK)
      }
      else -> Protocol.sw(Protocol.SW_INS_NOT_SUPPORTED)
    }
  }
}

class ProtocolTest {
  private val vector = JSONObject(javaClass.getResource("/node-vector.json")!!.readText())

  @BeforeTest
  fun clock() {
    ReaderEngine.nanoTime = { System.nanoTime() }
  }

  private fun session(
    card: FakeStudentCard,
    rosterKey: KeyPair = card.keys,
    startsAt: Long = System.currentTimeMillis() - 5 * 60_000,
    endsAt: Long = System.currentTimeMillis() + 60 * 60_000,
    roster: Boolean = true,
  ) = AttendanceSession(
    sessionId = UUID.randomUUID().toString(),
    label = "CS4473 Lecture 5",
    startsAt = startsAt,
    endsAt = endsAt,
    opensBeforeMin = 15,
    lateAfterMin = 15,
    roster = if (roster) mapOf(card.deviceId to StudentKey(card.deviceId, "student-1", "Nimal Perera", "200123X", rosterKey.public)) else emptyMap(),
    marked = mutableSetOf(),
  )

  @Test
  fun `Kotlin builds byte-identical messages to packages-shared (TypeScript)`() {
    val authData = Apdu.authData(vector.getString("contextId"), unhex(vector.getString("nonceHex")), vector.getLong("hostTime"))
    val deviceId = Protocol.uuidToBytes(vector.getString("deviceId"))
    val student = Protocol.nfcProofMessage(Protocol.PURPOSE_ATTEND, authData, deviceId)
    val reader = Apdu.proofMessage(Apdu.PURPOSE_ATTEND, authData, Apdu.uuidToBytes(vector.getString("deviceId")))
    assertEquals(vector.getString("messageHex"), hex(student))
    assertContentEquals(student, reader)
    assertEquals(vector.getString("loginMessageHex"), hex(Protocol.loginMessage(vector.getString("deviceId"), ByteArray(32) { 7 })))
  }

  @Test
  fun `a signature made by Node verifies with the reader's key parsing and message builder`() {
    val key = ReaderEngine.parseKey(vector.getString("publicKey"))
    val ok = Signature.getInstance("SHA256withECDSA").run {
      initVerify(key)
      update(unhex(vector.getString("messageHex")))
      verify(Apdu.fromB64url(vector.getString("signature")))
    }
    assertTrue(ok)
  }

  @Test
  fun `attendance tap is verified offline, confirmed on the student phone and timed`() {
    val card = FakeStudentCard()
    val s = session(card)
    val e = ReaderEngine.attend(card, s, System.nanoTime())
    assertEquals("OK", e["outcome"], e.toString())
    assertEquals("PRESENT", e["status"])
    assertEquals(card.deviceId, e["deviceId"])
    assertEquals("student-1", e["studentId"])
    listOf("tSelectMs", "tAuthMs", "tVerifyMs", "tTotalMs", "tConfirmMs").forEach { assertNotNull(e[it], it) }
    assertEquals(Apdu.Result.PRESENT to "Present: CS4473 Lecture 5", card.confirms.single().let { it.first to it.second.substringBeforeLast(" ") })

    // The proof the host uploads must verify server-side too: recompute it from the event.
    val authData = Apdu.authData(s.sessionId, Apdu.fromB64url(e["nonce"] as String), (e["hostTime"] as Double).toLong())
    val msg = Apdu.proofMessage(Apdu.PURPOSE_ATTEND, authData, Apdu.uuidToBytes(card.deviceId))
    assertTrue(Signature.getInstance("SHA256withECDSA").run { initVerify(card.keys.public); update(msg); verify(Apdu.fromB64url(e["signature"] as String)) })

    val again = ReaderEngine.attend(card, s, System.nanoTime())
    assertEquals("DUPLICATE", again["outcome"])
    assertEquals(Apdu.Result.ALREADY_MARKED, card.confirms.last().first)
  }

  @Test
  fun `late, outside window, forged key, unknown phone and unregistered app are rejected correctly`() {
    val card = FakeStudentCard()
    assertEquals("LATE", ReaderEngine.attend(card, session(card, startsAt = System.currentTimeMillis() - 30 * 60_000), System.nanoTime())["status"])
    assertEquals("OUTSIDE_WINDOW", ReaderEngine.attend(card, session(card, startsAt = System.currentTimeMillis() + 60 * 60_000), System.nanoTime())["outcome"])
    assertEquals("BAD_SIGNATURE", ReaderEngine.attend(card, session(card, rosterKey = ecKeyPair()), System.nanoTime())["outcome"])
    assertEquals(Apdu.Result.BAD_SIGNATURE, card.confirms.last().first)
    assertEquals("UNKNOWN_DEVICE", ReaderEngine.attend(card, session(card, roster = false), System.nanoTime())["outcome"])

    val fresh = FakeStudentCard(registered = false)
    val e = ReaderEngine.attend(fresh, session(fresh), System.nanoTime())
    assertEquals("PROTOCOL_ERROR", e["outcome"])
    assertEquals("STUDENT_APP_NOT_REGISTERED", e["errorDetail"])
  }

  @Test
  fun `enrolment proof is signed over the ENROLL purpose and class id`() {
    val card = FakeStudentCard()
    val classId = UUID.randomUUID().toString()
    val e = ReaderEngine.enrollProof(card, EnrollSession(classId, "CS4473", 8000), System.nanoTime())
    assertEquals("PENDING", e["outcome"])
    val authData = Apdu.authData(classId, Apdu.fromB64url(e["nonce"] as String), (e["hostTime"] as Double).toLong())
    val enrollMsg = Apdu.proofMessage(Apdu.PURPOSE_ENROLL, authData, Apdu.uuidToBytes(card.deviceId))
    val attendMsg = Apdu.proofMessage(Apdu.PURPOSE_ATTEND, authData, Apdu.uuidToBytes(card.deviceId))
    val sig = Apdu.fromB64url(e["signature"] as String)
    fun isValid(m: ByteArray): Boolean {
      val v = Signature.getInstance("SHA256withECDSA")
      v.initVerify(card.keys.public)
      v.update(m)
      return v.verify(sig)
    }
    assertTrue(isValid(enrollMsg))
    assertTrue(!isValid(attendMsg), "purpose byte must separate ENROLL and ATTEND proofs")
  }

  @Test
  fun `confirm text is capped at 64 UTF-8 bytes`() {
    val apdu = Apdu.confirm(0, "Present: " + "ශ්‍රී ලංකා ".repeat(10))
    val lc = apdu[4].toInt() and 0xFF
    assertTrue(lc <= 64)
    assertEquals(5 + lc, apdu.size)
  }
}
