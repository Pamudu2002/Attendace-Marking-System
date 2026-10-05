package lk.attendance.reader

import android.util.Base64
import java.nio.ByteBuffer
import java.util.UUID

/** Reader side of the APDU protocol. Mirrors packages/shared/src/protocol.ts; keep in sync. */
object Apdu {
  val AID: ByteArray = byteArrayOf(0xF0.toByte(), 0x41, 0x54, 0x54, 0x45, 0x4E, 0x44)
  const val PURPOSE_ENROLL = 0x01
  const val PURPOSE_ATTEND = 0x02

  const val SW_OK = 0x9000
  const val SW_FILE_NOT_FOUND = 0x6A82 // AID not installed on the other phone
  const val SW_NOT_REGISTERED = 0x6985

  object Result {
    const val PRESENT = 0x00
    const val LATE = 0x01
    const val ALREADY_MARKED = 0x02
    const val ENROLLED = 0x03
    const val NOT_ENROLLED = 0x10
    const val OUTSIDE_WINDOW = 0x11
    const val BAD_SIGNATURE = 0x12
    const val UNKNOWN_DEVICE = 0x13
  }

  private val NFC_TAG = "ATTv1-NFC".toByteArray(Charsets.US_ASCII)

  fun select(): ByteArray = byteArrayOf(0x00, 0xA4.toByte(), 0x04, 0x00, AID.size.toByte()) + AID + byteArrayOf(0x00)

  /** AUTH: CLA 80, INS 10, P1 purpose, Lc 40, data = contextId | nonce | hostTime, Le 00. */
  fun auth(purpose: Int, authData: ByteArray): ByteArray =
    byteArrayOf(0x80.toByte(), 0x10, purpose.toByte(), 0x00, authData.size.toByte()) + authData + byteArrayOf(0x00)

  /** CONFIRM: CLA 80, INS 20, P1 result, data = UTF-8 text (≤ 64 bytes). */
  fun confirm(result: Int, text: String): ByteArray {
    val bytes = truncateUtf8(text, 64)
    return byteArrayOf(0x80.toByte(), 0x20, result.toByte(), 0x00, bytes.size.toByte()) + bytes
  }

  fun authData(contextId: String, nonce: ByteArray, hostTime: Long): ByteArray =
    uuidToBytes(contextId) + nonce + ByteBuffer.allocate(8).putLong(hostTime).array()

  /** "ATTv1-NFC" || purpose || contextId | nonce | hostTime || deviceId — exactly what the student phone signs. */
  fun proofMessage(purpose: Int, authData: ByteArray, deviceId: ByteArray): ByteArray =
    NFC_TAG + byteArrayOf(purpose.toByte()) + authData + deviceId

  fun sw(response: ByteArray): Int =
    if (response.size < 2) -1 else ((response[response.size - 2].toInt() and 0xFF) shl 8) or (response.last().toInt() and 0xFF)

  fun data(response: ByteArray): ByteArray = response.copyOfRange(0, maxOf(0, response.size - 2))

  fun uuidToBytes(id: String): ByteArray {
    val u = UUID.fromString(id)
    return ByteBuffer.allocate(16).putLong(u.mostSignificantBits).putLong(u.leastSignificantBits).array()
  }

  fun bytesToUuid(b: ByteArray): String {
    val buf = ByteBuffer.wrap(b)
    return UUID(buf.long, buf.long).toString()
  }

  fun b64url(b: ByteArray): String = Base64.encodeToString(b, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  fun fromB64url(s: String): ByteArray = Base64.decode(s, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)

  private fun truncateUtf8(text: String, max: Int): ByteArray {
    var s = text
    while (s.toByteArray(Charsets.UTF_8).size > max) s = s.dropLast(1)
    return s.toByteArray(Charsets.UTF_8)
  }
}
